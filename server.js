const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config({ quiet: true });

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

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
  PINATA_ENDPOINT,
  createApp,
  createUploadMetadataHandler,
  gatewayURLForCID,
};
