const { createPublicClient, http } = require("viem");
const CCTP = require("../config/cctp");

const getViemClient = (network) => {
  return createPublicClient({
    transport: http(CCTP.rpc[network]),
  });
};

const buildApproveTransaction = async (
  client,
  walletAddress,
  config,
  amount,
) => {
  // const nonce = await client.getTransactionCount({
  //   address: walletAddress,
  // });

  // const gasPrice = await client.getGasPrice();
  // const maxFeePerGas = (gasPrice * 120n) / 100n;
  // const maxPriorityFeePerGas = BigInt(2000000000); // 2 gwei

  return {
    address: config.usdc,
    abi: CCTP.abis.usdc,
    functionName: "approve",
    args: [config.tokenMessenger, amount],
    // nonce,
    // maxFeePerGas,
    // maxPriorityFeePerGas,
  };
};

const buildBurnTransaction = async (
  client,
  walletAddress,
  config,
  amount,
  destinationDomain,
  mintRecipient,
) => {
  const nonce = await client.getTransactionCount({
    address: walletAddress,
  });

  const gasPrice = await client.getGasPrice();
  const maxFeePerGas = (gasPrice * 120n) / 100n;
  const maxPriorityFeePerGas = BigInt(2000000000);

  return {
    address: config.tokenMessenger,
    abi: CCTP.abis.tokenMessenger,
    functionName: "depositForBurn",
    args: [amount, destinationDomain, mintRecipient, config.usdc],
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
};

const buildReceiveTransaction = async (
  client,
  walletAddress,
  config,
  message,
  attestation,
) => {
  const nonce = await client.getTransactionCount({
    address: walletAddress,
  });

  const gasPrice = await client.getGasPrice();
  const maxFeePerGas = (gasPrice * 120n) / 100n;
  const maxPriorityFeePerGas = BigInt(2000000000);

  return {
    address: config.messageTransmitter,
    abi: CCTP.abis.messageTransmitter,
    functionName: "receiveMessage",
    args: [message, attestation],
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
};

module.exports = {
  getViemClient,
  buildApproveTransaction,
  buildBurnTransaction,
  buildReceiveTransaction,
};
