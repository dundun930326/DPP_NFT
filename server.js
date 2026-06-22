const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config({ quiet: true });

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const IPFS_FETCH_TIMEOUT_MS = 10000;

function isMetadataObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function gatewayURLForCID(cid, configuredGateway) {
  const configured = configuredGateway?.trim();
  if (!configured) {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }

  let base = configured.startsWith("http://") || configured.startsWith("https://")
    ? configured
    : `https://${configured}`;
  base = base.replace(/\/+$/, "");

  if (base.includes("{cid}")) {
    return base.replaceAll("{cid}", cid);
  }
  if (base.endsWith("/ipfs")) {
    return `${base}/${cid}`;
  }
  return `${base}/ipfs/${cid}`;
}

function exposedError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function validateCID(cid) {
  if (
    typeof cid !== "string" ||
    !cid ||
    cid === "." ||
    cid === ".." ||
    cid.length > 200 ||
    !/^[a-zA-Z0-9-]+$/.test(cid)
  ) {
    throw exposedError(400, "IPFS token URI contains an invalid CID.");
  }
}

function normalizeIPFSPath(rawPath) {
  if (!rawPath) return "";
  if (rawPath.includes("\\") || rawPath.includes("?") || rawPath.includes("#")) {
    throw exposedError(400, "IPFS token URI contains an invalid path.");
  }

  const safeSegments = rawPath.split("/").map((segment) => {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw exposedError(400, "IPFS token URI contains an invalid path.");
    }
    if (
      !decoded ||
      decoded === "." ||
      decoded === ".." ||
      !/^[a-zA-Z0-9._~-]+$/.test(decoded)
    ) {
      throw exposedError(400, "IPFS token URI contains an invalid path.");
    }
    return decoded;
  });
  return safeSegments.join("/");
}

function normalizeIPFSTokenURI(tokenURI) {
  if (typeof tokenURI !== "string" || !tokenURI.trim()) {
    throw exposedError(400, "tokenURI is required.");
  }

  const value = tokenURI.trim();
  let cid;
  let rawPath = "";

  if (value.startsWith("ipfs://")) {
    const remainder = value.slice("ipfs://".length);
    const parts = remainder.split("/");
    cid = parts.shift();
    rawPath = parts.join("/");
  } else {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw exposedError(400, "Unsupported IPFS token URI.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      parsed.search
    ) {
      throw exposedError(400, "Unsupported IPFS token URI.");
    }
    const marker = "/ipfs/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) {
      throw exposedError(400, "HTTPS tokenURI must contain an /ipfs/ path.");
    }
    const remainder = parsed.pathname.slice(markerIndex + marker.length);
    const parts = remainder.split("/");
    cid = parts.shift();
    rawPath = parts.join("/");
  }

  validateCID(cid);
  const path = normalizeIPFSPath(rawPath);
  return {
    cid,
    path,
    tokenURI: `ipfs://${cid}${path ? `/${path}` : ""}`,
  };
}

function gatewayURLForIPFSResource(resource, configuredGateway) {
  const base = gatewayURLForCID(resource.cid, configuredGateway);
  if (!resource.path) return base;
  const encodedPath = resource.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encodedPath}`;
}

function pinataFileName(metadata, timestamp) {
  const order = String(metadata?.dpp?.order || "A2207")
    .replace(/^#/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
  const stage = String(metadata?.dpp?.stage || "dye-fnsh")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
  return `dpp-${order}-${stage}-${timestamp}.json`;
}

function safeClientError(error) {
  if (error.statusCode && error.expose) {
    return { statusCode: error.statusCode, message: error.message };
  }
  return {
    statusCode: 502,
    message: "Unable to upload metadata to Pinata.",
  };
}

function safeMetadataFetchError(error) {
  if (error.statusCode && error.expose) {
    return { statusCode: error.statusCode, message: error.message };
  }
  if (error.name === "AbortError") {
    return {
      statusCode: 504,
      message: "IPFS gateway request timed out.",
    };
  }
  return {
    statusCode: 502,
    message: "Unable to fetch metadata from the IPFS gateway.",
  };
}

function createUploadMetadataHandler({
  env = process.env,
  pinataFetch = global.fetch,
  now = Date.now,
  logger = console,
} = {}) {
  return async function uploadMetadataHandler(req, res) {
    try {
      if (!env.PINATA_JWT) {
        const error = new Error("PINATA_JWT is not configured on the server.");
        error.statusCode = 503;
        error.expose = true;
        throw error;
      }
      if (!isMetadataObject(req.body)) {
        const error = new Error("Request body must be a non-empty metadata JSON object.");
        error.statusCode = 400;
        error.expose = true;
        throw error;
      }
      if (typeof pinataFetch !== "function") {
        throw new Error("Server fetch implementation is unavailable.");
      }

      const pinataResponse = await pinataFetch(PINATA_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PINATA_JWT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pinataOptions: { cidVersion: 1 },
          pinataMetadata: {
            name: pinataFileName(req.body, now()),
          },
          pinataContent: req.body,
        }),
      });

      const responseText = await pinataResponse.text();
      let pinataResult;
      try {
        pinataResult = JSON.parse(responseText);
      } catch {
        pinataResult = null;
      }

      if (!pinataResponse.ok) {
        throw new Error(`Pinata responded with HTTP ${pinataResponse.status}.`);
      }
      if (!pinataResult?.IpfsHash) {
        throw new Error("Pinata response did not include an IPFS CID.");
      }

      const cid = pinataResult.IpfsHash;
      return res.status(200).json({
        cid,
        tokenURI: `ipfs://${cid}`,
        gatewayURL: gatewayURLForCID(cid, env.PINATA_GATEWAY),
      });
    } catch (error) {
      logger.error("Pinata metadata upload failed:", error);
      const clientError = safeClientError(error);
      return res.status(clientError.statusCode).json({
        error: clientError.message,
      });
    }
  };
}

function createFetchMetadataHandler({
  env = process.env,
  gatewayFetch = global.fetch,
  now = () => new Date(),
  timeoutMs = IPFS_FETCH_TIMEOUT_MS,
  logger = console,
} = {}) {
  return async function fetchMetadataHandler(req, res) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resource = normalizeIPFSTokenURI(req.query?.tokenURI);
      if (typeof gatewayFetch !== "function") {
        throw new Error("Server fetch implementation is unavailable.");
      }
      const gatewayURL = gatewayURLForIPFSResource(
        resource,
        env.PINATA_GATEWAY,
      );
      const gatewayResponse = await gatewayFetch(gatewayURL, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const responseText = await gatewayResponse.text();
      if (!gatewayResponse.ok) {
        throw new Error(
          `IPFS gateway responded with HTTP ${gatewayResponse.status}.`,
        );
      }

      let metadata;
      try {
        metadata = JSON.parse(responseText);
      } catch {
        throw new Error("IPFS gateway returned invalid JSON.");
      }
      if (!isMetadataObject(metadata)) {
        throw new Error("IPFS gateway did not return a metadata JSON object.");
      }

      const fetchedAt = now();
      return res.status(200).json({
        metadata,
        source: "ipfs",
        tokenURI: resource.tokenURI,
        gatewayURL,
        fetchedAt:
          fetchedAt instanceof Date
            ? fetchedAt.toISOString()
            : new Date(fetchedAt).toISOString(),
      });
    } catch (error) {
      logger.error("IPFS metadata fetch failed:", error);
      const clientError = safeMetadataFetchError(error);
      return res.status(clientError.statusCode).json({
        error: clientError.message,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function createApp(options = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      pinataConfigured: Boolean((options.env || process.env).PINATA_JWT),
    });
  });
  app.get("/fetch-metadata", createFetchMetadataHandler(options));
  app.post("/upload-metadata", createUploadMetadataHandler(options));

  app.use((error, _req, res, _next) => {
    (options.logger || console).error("IPFS upload server error:", error);
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
    return res.status(500).json({ error: "Internal upload server error." });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3001;
  createApp().listen(port, () => {
    console.log(`DPP IPFS upload server listening on http://localhost:${port}`);
  });
}

module.exports = {
  IPFS_FETCH_TIMEOUT_MS,
  PINATA_ENDPOINT,
  createApp,
  createFetchMetadataHandler,
  createUploadMetadataHandler,
  gatewayURLForCID,
  gatewayURLForIPFSResource,
  normalizeIPFSTokenURI,
};
