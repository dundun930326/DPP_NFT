// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721URIStorage} from
    "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title Simple DPP NFT
/// @notice Minimal unrestricted ERC-721 minter for the static Sepolia demo.
/// @dev Add issuer access control before using this contract in production.
contract SimpleDPPNFT is ERC721URIStorage {
    struct DPPRecord {
        bytes32 metadataHash;
        bytes32 schemaHash;
        bytes32 orderHash;
        bytes32 stage;
        uint256 previousTokenId;
        address issuer;
        uint256 createdAt;
    }

    uint256 private _nextTokenId = 1;

    mapping(uint256 tokenId => DPPRecord record) public dppRecords;

    event DPPMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        string tokenURI,
        bytes32 metadataHash,
        bytes32 schemaHash,
        bytes32 orderHash,
        bytes32 stage,
        uint256 previousTokenId
    );

    constructor() ERC721("Simple DPP NFT", "DPP") {}

    function mintDPP(
        address to,
        string calldata tokenURI_,
        bytes32 metadataHash,
        bytes32 schemaHash,
        bytes32 orderHash,
        bytes32 stage,
        uint256 previousTokenId
    ) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        dppRecords[tokenId] = DPPRecord({
            metadataHash: metadataHash,
            schemaHash: schemaHash,
            orderHash: orderHash,
            stage: stage,
            previousTokenId: previousTokenId,
            issuer: msg.sender,
            createdAt: block.timestamp
        });

        emit DPPMinted(
            tokenId,
            to,
            tokenURI_,
            metadataHash,
            schemaHash,
            orderHash,
            stage,
            previousTokenId
        );
    }
}
