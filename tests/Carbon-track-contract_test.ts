
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Commit 1: Core NFT Functions Tests
// Testing mint-carbon-credit, transfer-carbon-credit, and retire-carbon-credit functions

Clarinet.test({
    name: "mint-carbon-credit: Successfully mints carbon credit with valid parameters",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        
        // First, verify the certification body
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address)
        ]);
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Now mint a carbon credit
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1000), // 1000 kg CO2
                types.ascii("Reforestation Project Alpha"),
                types.utf8("A comprehensive reforestation project in the Amazon rainforest"),
                types.ascii(certificationBody),
                types.ascii("Amazon Basin, Brazil"),
                types.ascii("Reforestation")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectUint(1);
        
        // Verify NFT data is stored correctly
        const nftData = chain.callReadOnlyFn("Carbon-track-contract", "get-carbon-nft", [types.uint(1)], deployer.address);
        const nft = nftData.result.expectSome().expectTuple() as any;
        assertEquals(nft['amount'], types.uint(1000));
        assertEquals(nft['project-name'], types.ascii("Reforestation Project Alpha"));
        assertEquals(nft['is-retired'], types.bool(false));
        assertEquals(nft['owner'].toString(), deployer.address);
    },
});

Clarinet.test({
    name: "mint-carbon-credit: Fails with invalid amount (below minimum)",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        
        // Verify certification body first
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        // Try to mint with invalid amount (0 kg CO2 - below minimum of 1)
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(0), // Invalid amount
                types.ascii("Test Project"),
                types.utf8("Test description"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3002); // ERR-INVALID-AMOUNT
    },
});

Clarinet.test({
    name: "mint-carbon-credit: Fails with unverified certification body",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const unverifiedBody = "FAKE-CERT";
        
        // Try to mint with unverified certification body
        const block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1000),
                types.ascii("Test Project"),
                types.utf8("Test description"),
                types.ascii(unverifiedBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3011); // ERR-INVALID-CERTIFICATION
    },
});

Clarinet.test({
    name: "transfer-carbon-credit: Successfully transfers NFT to another user",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const certificationBody = "UN-CER";
        
        // Setup: Verify certification body and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(500),
                types.ascii("Transfer Test Project"),
                types.utf8("Project for testing transfers"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // Transfer NFT to wallet1
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "transfer-carbon-credit", [
                types.uint(1),
                types.principal(wallet1.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify ownership changed
        const owner = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-owner-readonly", [types.uint(1)], deployer.address);
        owner.result.expectSome().expectPrincipal(wallet1.address);
        
        const nftData = chain.callReadOnlyFn("Carbon-track-contract", "get-carbon-nft", [types.uint(1)], deployer.address);
        const nft = nftData.result.expectSome().expectTuple() as any;
        assertEquals(nft['owner'].toString(), wallet1.address);
    },
});

Clarinet.test({
    name: "transfer-carbon-credit: Fails when not owner",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const wallet1 = accounts.get('wallet_1')!;
        const wallet2 = accounts.get('wallet_2')!;
        const certificationBody = "UN-CER";
        
        // Setup: Verify certification body and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(500),
                types.ascii("Transfer Test Project"),
                types.utf8("Project for testing transfers"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // Try to transfer NFT from non-owner account
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "transfer-carbon-credit", [
                types.uint(1),
                types.principal(wallet2.address)
            ], wallet1.address) // wallet1 is NOT the owner
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3004); // ERR-NOT-OWNER
    },
});

Clarinet.test({
    name: "retire-carbon-credit: Successfully retires carbon credit",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        const retirementProof = "Retired for corporate carbon neutrality - Certificate #ABC123";
        
        // Setup: Verify certification body and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1500),
                types.ascii("Retirement Test Project"),
                types.utf8("Project for testing retirement"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // Retire the carbon credit
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8(retirementProof)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify NFT is marked as retired
        const nftData = chain.callReadOnlyFn("Carbon-track-contract", "get-carbon-nft", [types.uint(1)], deployer.address);
        const nft = nftData.result.expectSome().expectTuple() as any;
        assertEquals(nft['is-retired'], types.bool(true));
        assertEquals(nft['retirement-proof'], types.utf8(retirementProof));
        
        // Verify total retired carbon is updated
        const totalRetired = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-retired", [], deployer.address);
        totalRetired.result.expectUint(1500);
    },
});

Clarinet.test({
    name: "retire-carbon-credit: Fails when NFT is already retired",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        
        // Setup: Verify certification body, mint and retire NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(500),
                types.ascii("Double Retirement Test"),
                types.utf8("Testing double retirement"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // First retirement
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("First retirement")
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try to retire again
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("Second retirement attempt")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3005); // ERR-ALREADY-RETIRED
    },
});

Clarinet.test({
    name: "NFT counter and global statistics tracking",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        
        // Verify certification body
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        // Check initial state
        let counter = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-counter", [], deployer.address);
        counter.result.expectUint(0);
        
        let totalMinted = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-minted", [], deployer.address);
        totalMinted.result.expectUint(0);
        
        // Mint first NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1000),
                types.ascii("First NFT"),
                types.utf8("First NFT description"),
                types.ascii(certificationBody),
                types.ascii("Location 1"),
                types.ascii("Type 1")
            ], deployer.address)
        ]);
        
        // Check updated state
        counter = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-counter", [], deployer.address);
        counter.result.expectUint(1);
        
        totalMinted = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-minted", [], deployer.address);
        totalMinted.result.expectUint(1000);
        
        // Mint second NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(2000),
                types.ascii("Second NFT"),
                types.utf8("Second NFT description"),
                types.ascii(certificationBody),
                types.ascii("Location 2"),
                types.ascii("Type 2")
            ], deployer.address)
        ]);
        
        // Final state check
        counter = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-counter", [], deployer.address);
        counter.result.expectUint(2);
        
        totalMinted = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-minted", [], deployer.address);
        totalMinted.result.expectUint(3000);
    },
});
