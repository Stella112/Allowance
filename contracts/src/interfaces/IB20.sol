// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Minimal views of Base's B20 tokenized-stock precompiles.
/// Sources (checked 2026-11-04, see docs/VERIFIED.md):
/// https://docs.base.org/specifications/b20/reference/constants
interface IB20Policy {
    /// The transfer policy bound to a scope (for example TRANSFER_RECEIVER).
    function policyId(bytes32 scope) external view returns (uint64);
}

interface IPolicyRegistry {
    /// Whether `account` passes policy `policyId`. Never reverts.
    function isAuthorized(uint64 policyId, address account) external view returns (bool);
}
