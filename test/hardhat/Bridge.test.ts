import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { Contract, ContractFactory } from 'ethers'
import { deployments, ethers } from 'hardhat'

import { Options } from '@layerzerolabs/lz-v2-utilities'

describe('Bridge Test', function () {
  // Constant representing a mock Endpoint ID for testing purposes
  const eidA = 1
  const eidB = 2
  // Declaration of variables to be used in the test suite
  let EthDFG: ContractFactory
  let EthBridge: ContractFactory

  let BaseDFG: ContractFactory
  let BaseBridge: ContractFactory

  let EndpointV2Mock: ContractFactory
  let ownerA: SignerWithAddress
  let ownerB: SignerWithAddress
  let user: SignerWithAddress
  let endpointOwner: SignerWithAddress

  let ethDFG: Contract
  let ethBridge: Contract

  let baseDFG: Contract
  let baseBridge: Contract

  let mockEndpointV2A: Contract
  let mockEndpointV2B: Contract

  // Before hook for setup that runs once before all tests in the block
  before(async function () {
    // Contract factory for our tested contract
    EthDFG = await ethers.getContractFactory('EthDFG')
    EthBridge = await ethers.getContractFactory('EthBridge')
    BaseDFG = await ethers.getContractFactory('BaseDFG')
    BaseBridge = await ethers.getContractFactory('BaseBridge')

    // Fetching the first three signers (accounts) from Hardhat's local Ethereum network
    const signers = await ethers.getSigners()

    ownerA = signers.at(0)!
    ownerB = signers.at(1)!
    user = signers.at(2)!
    endpointOwner = signers.at(2)!

    // The EndpointV2Mock contract comes from @layerzerolabs/test-devtools-evm-hardhat package
    // and its artifacts are connected as external artifacts to this project
    //
    // Unfortunately, hardhat itself does not yet provide a way of connecting external artifacts,
    // so we rely on hardhat-deploy to create a ContractFactory for EndpointV2Mock
    //
    // See https://github.com/NomicFoundation/hardhat/issues/1040
    const EndpointV2MockArtifact = await deployments.getArtifact('EndpointV2Mock')
    EndpointV2Mock = new ContractFactory(EndpointV2MockArtifact.abi, EndpointV2MockArtifact.bytecode, endpointOwner)
  })

  // beforeEach hook for setup that runs before each test in the block
  beforeEach(async function () {
    // Deploying a mock LZ EndpointV2 with the given Endpoint ID
    mockEndpointV2A = await EndpointV2Mock.deploy(eidA)
    mockEndpointV2B = await EndpointV2Mock.deploy(eidB)

    // Deploying two instances of DFG Contract 
    ethDFG = await EthDFG.deploy("EthDFG", "EDFG")
    baseDFG = await BaseDFG.deploy("BaseDFG", "BDFG")

    // Deploying two instances of Bridge contract and linking them to the mock LZEndpoint
    ethBridge = await EthBridge.deploy(mockEndpointV2A.address, ownerA.address, ethDFG.address)
    baseBridge = await BaseBridge.deploy(mockEndpointV2B.address, ownerB.address, baseDFG.address)

    // Adding the Bridge contract to the DFG contract's verified list
    // convert string to bytes32
    await ethDFG.addVerified(ethBridge.address, ethers.utils.formatBytes32String('ethBridge'))

    // Setting the Bridge contract as the minter for the DFG contract
    await baseDFG.addMinter(baseBridge.address)

    // Setting destination endpoints in the LZEndpoint mock for each MyOApp instance
    await mockEndpointV2A.setDestLzEndpoint(baseBridge.address, mockEndpointV2B.address)
    await mockEndpointV2B.setDestLzEndpoint(ethBridge.address, mockEndpointV2A.address)

    // Setting each Bridge instance as a peer of the other
    await ethBridge.connect(ownerA).setPeer(eidB, ethers.utils.zeroPad(baseBridge.address, 32))
    await baseBridge.connect(ownerB).setPeer(eidA, ethers.utils.zeroPad(ethBridge.address, 32))
  })

  // A test case to verify message sending functionality
  it('should bridge from eth to base success', async function () {
    await bridgeFromEthToBase()
  })

  it('should bridge from base to eth success', async function () {

    // bridge from eth to base
    await bridgeFromEthToBase()

    // bridge back from base to eth
    // expected user already has 1000 baseDFG tokens
    const amount = '1000'
    const amountToWei = ethers.utils.parseUnits(amount, 18)
    const assetId = '0'

    // Define native fee and quote for the message send operation
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString()
    let nativeFee = 0
    ;[nativeFee] = await baseBridge.quote(eidA, user.address, amountToWei.toString(), assetId, options, false)

    // bridge tokens from base to eth
    await baseBridge.connect(user).bridgeToken(eidA, user.address, amountToWei, assetId, options, { value: nativeFee.toString() })

    expect((await ethDFG.balanceOf(user.address)).toString()).to.equal(amount)
  })

  async function bridgeFromEthToBase() {
    // mint ethdfg tokens to user and approve ethbridge to spend
    await ethDFG.addVerified(user.address, ethers.utils.formatBytes32String('user'))
    await ethDFG.mint(user.address, 1000)
    await ethDFG.connect(user).approve(ethBridge.address, 1000)

    const amount = '1000'
    const assetId = '0'

    // Define native fee and quote for the message send operation
    const options = Options.newOptions().addExecutorLzReceiveOption(200000, 0).toHex().toString()
    let nativeFee = 0
    ;[nativeFee] = await ethBridge.quote(eidB, user.address, amount, assetId, options, false)

    // bridge tokens from eth to base
    await ethBridge.connect(user).bridgeToken(eidB, user.address, amount, assetId, options, { value: nativeFee.toString() })

    const amountToWei = ethers.utils.parseUnits(amount, 18)
    expect((await baseDFG.balanceOf(user.address)).toString()).to.equal(amountToWei.toString())
  }
})
