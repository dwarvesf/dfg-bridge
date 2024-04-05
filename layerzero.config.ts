import { EndpointId } from '@layerzerolabs/lz-definitions'

import type { OAppOmniGraphHardhat, OmniPointHardhat } from '@layerzerolabs/toolbox-hardhat'

const sepoliaContract: OmniPointHardhat = {
    eid: EndpointId.SEPOLIA_V2_TESTNET,
    contractName: 'EthBridge',
}

const basesepoliaContract: OmniPointHardhat = {
    eid: EndpointId.BASE_V2_TESTNET,
    contractName: 'BaseBridge',
}


const config: OAppOmniGraphHardhat = {
    contracts: [
        {
            contract: sepoliaContract,
        },
        {
            contract: basesepoliaContract,
        },
    ],
    connections: [
        {
            from: sepoliaContract,
            to: basesepoliaContract,
        },
        {
            from: basesepoliaContract,
            to: sepoliaContract,
        },
    ],
}

export default config
