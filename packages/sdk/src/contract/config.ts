export interface ContractConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  nativeTokenId: string;
}

export function getContractConfig(): ContractConfig {
  return {
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || process.env.VITE_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
    networkPassphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || process.env.VITE_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    contractId: process.env.NEXT_PUBLIC_CONTRACT_ID || process.env.VITE_CONTRACT_ID || 'CDRRXSPCE6B7DPUUIOUBIVOHWQM5R5TVJIORTAY4T5MPITSP4EIYGSLH',
    nativeTokenId: process.env.NEXT_PUBLIC_NATIVE_TOKEN_ID || process.env.VITE_NATIVE_TOKEN_ID || 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  };
}
