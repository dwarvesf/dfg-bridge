// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OApp, MessagingFee, Origin } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import { MessagingReceipt } from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OAppSender.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface Minter {
  function mint(address to, uint amount) external;
}

interface Burner {
  function burn(address from, uint amount) external;
}


contract BaseBridge is OApp {
  using SafeERC20 for IERC20;

  // Structs
  struct MintMessage {
    address to;
    uint amount;
    uint id;
  }

  // State variables
  bool open = true;
  IERC20[] public assets;

  // Events
  event MintMessageReceived(uint32 indexed srcChainId, address indexed to, uint amount, uint id);
  event BridgingInitiated(uint32 indexed targetChainId, address indexed to, uint amount, uint id);

  constructor(
    address _endpoint, 
    address _delegate,
    IERC20 _asset
  ) OApp(_endpoint, _delegate) Ownable(_delegate) {
    assets.push(_asset);
  }

  /**
   * @notice Bridge token from the source chain to a destination chain.
   * @param _dstEid The endpoint ID of the destination chain.
   * @param _to The address of whom you want to bridge the assets to.
   * @param _amount The asset amount you wanna bridge.
   * @dev Encodes the message as bytes and sends it using the `_lzSend` internal function.
   * @return receipt A `MessagingReceipt` struct containing details of the message sent.
   */
  function bridgeToken(
    uint32 _dstEid,
    address _to,
    uint _amount,
    uint _id,
    bytes memory _options
  ) external payable returns (MessagingReceipt memory receipt) {
    require(open, "Bridge: bridge is closed");
    require(_amount > 0, "Bridge: amount must be greater than 0");

    receipt = _lzSend(
      _dstEid,
      buildBridgeMessage(_to, _amount, _id),
      _options,
      MessagingFee(msg.value, 0),
      payable(msg.sender)
    );


    Burner(address(assets[_id])).burn(msg.sender, _amount);
    emit BridgingInitiated(_dstEid, _to, _amount, _id);
    return receipt;
  }

  /**
   * @notice Quotes the gas needed to pay for the full omnichain transaction in native gas or ZRO token.
   * @param _dstEid Destination chain's endpoint ID.
   * @param _to The address of whom you want to bridge the assets to.
   * @param _amount The asset amount you wanna bridge.
   * @param _id The asset index that you want to bridge.
   * @param _options Message execution options (e.g., for sending gas to destination).
   * @param _payInLzToken Whether to return fee in ZRO token.
   * @return fee A `MessagingFee` struct containing the calculated gas fee in either the native token or ZRO token.
   */
  function quote(
    uint32 _dstEid,
    address _to,
    uint _amount,
    uint _id,
    bytes memory _options,
    bool _payInLzToken
  ) public view returns (MessagingFee memory fee) {
    bytes memory payload = buildBridgeMessage(_to, _amount, _id);
    fee = _quote(_dstEid, payload, _options, _payInLzToken);
  }


  // Moderate methods
  function setOpen(bool _open) external onlyOwner {
    open = _open;
  }

  function addAsset(IERC20 _asset) external onlyOwner {
    assets.push(_asset);
  }


  /**
   * @dev Internal function override to handle incoming messages from another chain.
   * @dev _origin A struct containing information about the message sender.
   * @dev _guid A unique global packet identifier for the message.
   * @param payload The encoded message payload being received.
   *
   * @dev The following params are unused in the current implementation of the OApp.
   * @dev _executor The address of the Executor responsible for processing the message.
   * @dev _extraData Arbitrary data appended by the Executor to the message.
   *
   * Decodes the received payload and processes it as per the business logic defined in the function.
   */
  function _lzReceive(
    Origin calldata _origin,
    bytes32 /*_guid*/,
    bytes calldata payload,
    address /*_executor*/,
    bytes calldata /*_extraData*/
  ) internal override {
    MintMessage memory message = abi.decode(payload, (MintMessage));
    // need to multiply by 10^18 to get the actual amount
    // since the decimal in src chain is 0 and dst chain is 18
    uint256 amount = message.amount * 10 ** 18;
    Minter(address(assets[message.id])).mint(message.to, amount);
    emit MintMessageReceived(_origin.srcEid, message.to, amount, message.id);
  }


  // utils
  function buildBridgeMessage(address to, uint amount, uint id) private pure returns (bytes memory) {
    return abi.encode(
      MintMessage({
        to: to,
        amount: amount,
        id: id
      })
    );
  }
}
