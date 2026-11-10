// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
/// @notice Only opaque event UUIDs and SHA-256 commitments belong here.
contract ChainMedAuditRegistry {
    address public owner;
    mapping(address => bool) public writers;
    struct Commitment { bytes32 digest; uint256 timestamp; }
    mapping(bytes32 => Commitment) private commitments;
    bytes32[] private inventory;
    event Anchored(bytes32 indexed eventId, bytes32 digest, address indexed writer);
    event WriterChanged(address indexed writer, bool authorized);
    constructor() { owner = msg.sender; writers[msg.sender] = true; }
    modifier onlyOwner() { require(msg.sender == owner, "owner only"); _; }
    function setWriter(address writer, bool authorized) external onlyOwner {
        require(writer != address(0), "zero writer"); writers[writer] = authorized;
        emit WriterChanged(writer, authorized);
    }
    function transferOwnership(address next) external onlyOwner { require(next != address(0), "zero owner"); owner = next; }
    function anchor(bytes32 eventId, bytes32 digest) external {
        require(writers[msg.sender], "writer only");
        require(eventId != bytes32(0) && digest != bytes32(0), "empty commitment");
        require(commitments[eventId].timestamp == 0, "already registered");
        commitments[eventId] = Commitment(digest, block.timestamp);
        inventory.push(eventId); emit Anchored(eventId, digest, msg.sender);
    }
    function get(bytes32 eventId) external view returns (bytes32 digest, uint256 timestamp) {
        Commitment memory c = commitments[eventId]; return (c.digest, c.timestamp);
    }
    function count() external view returns (uint256) { return inventory.length; }
    function eventAt(uint256 index) external view returns (bytes32) { return inventory[index]; }
}
