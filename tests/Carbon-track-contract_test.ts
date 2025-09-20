
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

// Commit 2: Marketplace Functions Tests
// Testing list-carbon-credit, buy-carbon-credit, and unlist-carbon-credit functions

Clarinet.test({
    name: "list-carbon-credit: Successfully lists carbon credit for sale",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        const listingPrice = 50000; // 0.05 STX
        
        // Setup: Verify certification body and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(750),
                types.ascii("Marketplace Test Project"),
                types.utf8("Project for testing marketplace"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // List the carbon credit
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(listingPrice)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify listing was created
        const listing = chain.callReadOnlyFn("Carbon-track-contract", "get-marketplace-listing", [types.uint(1)], deployer.address);
        const listingData = listing.result.expectSome().expectTuple() as any;
        assertEquals(listingData['nft-id'], types.uint(1));
        assertEquals(listingData['seller'].toString(), deployer.address);
        assertEquals(listingData['price'], types.uint(listingPrice));
        assertEquals(listingData['is-active'], types.bool(true));
    },
});

Clarinet.test({
    name: "list-carbon-credit: Fails with invalid price (below minimum)",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        
        // Setup: Verify certification body and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(500),
                types.ascii("Invalid Price Test"),
                types.utf8("Testing invalid price"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // Try to list with invalid price (below minimum of 1000 microSTX)
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(500) // Invalid price - below minimum
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3007); // ERR-INVALID-PRICE
    },
});

Clarinet.test({
    name: "list-carbon-credit: Fails when trying to list retired NFT",
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
                types.uint(800),
                types.ascii("Retired NFT Listing Test"),
                types.utf8("Testing retired NFT listing"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // Retire the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("Retired for testing")
            ], deployer.address)
        ]);
        
        // Try to list the retired NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(25000)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3005); // ERR-ALREADY-RETIRED
    },
});

Clarinet.test({
    name: "buy-carbon-credit: Successfully purchases listed carbon credit",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const buyer = accounts.get('wallet_1')!;
        const certificationBody = "UN-CER";
        const listingPrice = 100000; // 0.1 STX
        
        // Setup: Verify certification body, mint and list NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1200),
                types.ascii("Purchase Test Project"),
                types.utf8("Project for testing purchase"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // List the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(listingPrice)
            ], deployer.address)
        ]);
        
        // Buy the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], buyer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify ownership changed
        const owner = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-owner-readonly", [types.uint(1)], deployer.address);
        owner.result.expectSome().expectPrincipal(buyer.address);
        
        // Verify listing is no longer active
        const listing = chain.callReadOnlyFn("Carbon-track-contract", "get-marketplace-listing", [types.uint(1)], deployer.address);
        const listingData = listing.result.expectSome().expectTuple() as any;
        assertEquals(listingData['is-active'], types.bool(false));
        
        // Verify global sold statistics updated
        const totalSold = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-sold", [], deployer.address);
        totalSold.result.expectUint(1200);
    },
});

Clarinet.test({
    name: "buy-carbon-credit: Fails when trying to buy non-listed NFT",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const buyer = accounts.get('wallet_1')!;
        const certificationBody = "UN-CER";
        
        // Setup: Verify certification body and mint NFT (but don't list it)
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(600),
                types.ascii("Non-listed Purchase Test"),
                types.utf8("Testing non-listed purchase"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // Try to buy unlisted NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], buyer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3008); // ERR-LISTING-NOT-FOUND
    },
});

Clarinet.test({
    name: "buy-carbon-credit: Fails when seller tries to buy own NFT",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        const listingPrice = 75000; // 0.075 STX
        
        // Setup: Verify certification body, mint and list NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(900),
                types.ascii("Self Purchase Test"),
                types.utf8("Testing self purchase"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // List the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(listingPrice)
            ], deployer.address)
        ]);
        
        // Try to buy own NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], deployer.address) // Same as seller
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3010); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "unlist-carbon-credit: Successfully removes listing",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "UN-CER";
        const listingPrice = 60000; // 0.06 STX
        
        // Setup: Verify certification body, mint and list NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1100),
                types.ascii("Unlist Test Project"),
                types.utf8("Project for testing unlisting"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // List the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(listingPrice)
            ], deployer.address)
        ]);
        
        // Unlist the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "unlist-carbon-credit", [
                types.uint(1)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify listing is no longer active
        const listing = chain.callReadOnlyFn("Carbon-track-contract", "get-marketplace-listing", [types.uint(1)], deployer.address);
        const listingData = listing.result.expectSome().expectTuple() as any;
        assertEquals(listingData['is-active'], types.bool(false));
    },
});

Clarinet.test({
    name: "unlist-carbon-credit: Fails when non-seller tries to unlist",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const nonSeller = accounts.get('wallet_1')!;
        const certificationBody = "UN-CER";
        const listingPrice = 40000; // 0.04 STX
        
        // Setup: Verify certification body, mint and list NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(650),
                types.ascii("Unauthorized Unlist Test"),
                types.utf8("Testing unauthorized unlist"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // List the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(listingPrice)
            ], deployer.address)
        ]);
        
        // Try to unlist from non-seller account
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "unlist-carbon-credit", [
                types.uint(1)
            ], nonSeller.address) // Not the seller
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3004); // ERR-NOT-OWNER
    },
});

Clarinet.test({
    name: "Platform fee calculation and collection",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const buyer = accounts.get('wallet_1')!;
        const certificationBody = "UN-CER";
        const listingPrice = 1000000; // 1 STX
        const expectedFee = 10000; // 1% of 1 STX = 0.01 STX
        
        // Setup: Verify certification body, mint and list NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(2000),
                types.ascii("Fee Test Project"),
                types.utf8("Project for testing platform fees"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // List and buy the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(listingPrice)
            ], deployer.address)
        ]);
        
        // Check initial platform fees
        let totalFees = chain.callReadOnlyFn("Carbon-track-contract", "get-total-platform-fees", [], deployer.address);
        totalFees.result.expectUint(0);
        
        // Buy the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], buyer.address)
        ]);
        
        // Check platform fees were collected
        totalFees = chain.callReadOnlyFn("Carbon-track-contract", "get-total-platform-fees", [], deployer.address);
        totalFees.result.expectUint(expectedFee);
        
        // Verify fee collector is the deployer
        const feeCollector = chain.callReadOnlyFn("Carbon-track-contract", "get-platform-fee-collector", [], deployer.address);
        feeCollector.result.expectPrincipal(deployer.address);
    },
});

// Commit 3: Admin & Query Functions Tests
// Testing admin functions and all read-only query functions

Clarinet.test({
    name: "verify-certification-body: Successfully verifies new certification body",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certBody = "VERRA-VCS";
        
        // Verify new certification body
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify the certification body status
        const certData = chain.callReadOnlyFn("Carbon-track-contract", "get-certification-body", [types.ascii(certBody)], deployer.address);
        const cert = certData.result.expectSome().expectTuple() as any;
        assertEquals(cert['is-verified'], types.bool(true));
        assertEquals(cert['total-certifications'], types.uint(0));
    },
});

Clarinet.test({
    name: "verify-certification-body: Successfully revokes certification body",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certBody = "GOLD-STANDARD";
        
        // First verify the certification body
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        // Now revoke it
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody),
                types.bool(false)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify the certification body is now unverified
        const certData = chain.callReadOnlyFn("Carbon-track-contract", "get-certification-body", [types.ascii(certBody)], deployer.address);
        const cert = certData.result.expectSome().expectTuple() as any;
        assertEquals(cert['is-verified'], types.bool(false));
    },
});

Clarinet.test({
    name: "verify-certification-body: Fails when called by non-admin",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const nonAdmin = accounts.get('wallet_1')!;
        const certBody = "UNAUTHORIZED-CERT";
        
        // Try to verify certification body as non-admin
        const block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody),
                types.bool(true)
            ], nonAdmin.address) // Non-admin address
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3010); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "set-platform-fee-collector: Successfully changes fee collector",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const newCollector = accounts.get('wallet_1')!;
        
        // Change the platform fee collector
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "set-platform-fee-collector", [
                types.principal(newCollector.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify the fee collector changed
        const feeCollector = chain.callReadOnlyFn("Carbon-track-contract", "get-platform-fee-collector", [], deployer.address);
        feeCollector.result.expectPrincipal(newCollector.address);
    },
});

Clarinet.test({
    name: "set-platform-fee-collector: Fails when called by non-current collector",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const nonCollector = accounts.get('wallet_1')!;
        const targetCollector = accounts.get('wallet_2')!;
        
        // Try to change fee collector from non-collector account
        const block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "set-platform-fee-collector", [
                types.principal(targetCollector.address)
            ], nonCollector.address) // Not the current collector
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectErr().expectUint(3010); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "get-user-stats: Tracks user statistics correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const buyer = accounts.get('wallet_1')!;
        const certificationBody = "CLIMATE-ACTION";
        
        // Setup: Verify certification body and test user statistics
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            // Mint two NFTs
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(500),
                types.ascii("Stats Test 1"),
                types.utf8("First NFT for stats testing"),
                types.ascii(certificationBody),
                types.ascii("Location 1"),
                types.ascii("Type 1")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(700),
                types.ascii("Stats Test 2"),
                types.utf8("Second NFT for stats testing"),
                types.ascii(certificationBody),
                types.ascii("Location 2"),
                types.ascii("Type 2")
            ], deployer.address)
        ]);
        
        // Check deployer's initial stats after minting
        let deployerStats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(deployer.address)], deployer.address);
        let stats = deployerStats.result.expectSome().expectTuple() as any;
        assertEquals(stats['total-owned'], types.uint(1200)); // 500 + 700
        assertEquals(stats['total-sold'], types.uint(0));
        assertEquals(stats['total-retired'], types.uint(0));
        assertEquals(stats['total-purchased'], types.uint(0));
        
        // List and sell first NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(100000) // 0.1 STX
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], buyer.address)
        ]);
        
        // Check buyer's stats after purchase
        let buyerStats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(buyer.address)], deployer.address);
        stats = buyerStats.result.expectSome().expectTuple() as any;
        assertEquals(stats['total-owned'], types.uint(500));
        assertEquals(stats['total-purchased'], types.uint(500));
        
        // Retire second NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(2),
                types.utf8("Retired for corporate neutrality")
            ], deployer.address)
        ]);
        
        // Check deployer's final stats
        deployerStats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(deployer.address)], deployer.address);
        stats = deployerStats.result.expectSome().expectTuple() as any;
        assertEquals(stats['total-sold'], types.uint(500));
        assertEquals(stats['total-retired'], types.uint(700));
    },
});

Clarinet.test({
    name: "Query functions: get-carbon-nft returns complete NFT data",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "ISO-14064";
        const projectName = "Solar Farm Indonesia";
        const description = "Large scale solar installation reducing grid dependency";
        const location = "Java-Indonesia";
        const projectType = "Solar Energy";
        
        // Setup and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1500),
                types.ascii(projectName),
                types.utf8(description),
                types.ascii(certificationBody),
                types.ascii(location),
                types.ascii(projectType)
            ], deployer.address)
        ]);
        
        // Query NFT data and verify all fields
        const nftData = chain.callReadOnlyFn("Carbon-track-contract", "get-carbon-nft", [types.uint(1)], deployer.address);
        const nft = nftData.result.expectSome().expectTuple() as any;
        
        assertEquals(nft['owner'].toString(), deployer.address);
        assertEquals(nft['amount'], types.uint(1500));
        assertEquals(nft['project-name'], types.ascii(projectName));
        assertEquals(nft['project-description'], types.utf8(description));
        assertEquals(nft['certification-body'], types.ascii(certificationBody));
        assertEquals(nft['location'], types.ascii(location));
        assertEquals(nft['project-type'], types.ascii(projectType));
        assertEquals(nft['is-retired'], types.bool(false));
        assertEquals(nft['retirement-proof'], types.utf8(""));
        assertEquals(nft['retirement-date'], types.uint(0));
    },
});

Clarinet.test({
    name: "Query functions: Global statistics tracking accuracy",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const buyer = accounts.get('wallet_1')!;
        const certificationBody = "PLAN-VIVO";
        
        // Initial state check
        let totalMinted = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-minted", [], deployer.address);
        let totalRetired = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-retired", [], deployer.address);
        let totalSold = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-sold", [], deployer.address);
        
        totalMinted.result.expectUint(0);
        totalRetired.result.expectUint(0);
        totalSold.result.expectUint(0);
        
        // Setup and perform various operations
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            // Mint multiple NFTs
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1000),
                types.ascii("Global Stats Test 1"),
                types.utf8("First NFT for global stats"),
                types.ascii(certificationBody),
                types.ascii("Location A"),
                types.ascii("Type A")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1500),
                types.ascii("Global Stats Test 2"),
                types.utf8("Second NFT for global stats"),
                types.ascii(certificationBody),
                types.ascii("Location B"),
                types.ascii("Type B")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(800),
                types.ascii("Global Stats Test 3"),
                types.utf8("Third NFT for global stats"),
                types.ascii(certificationBody),
                types.ascii("Location C"),
                types.ascii("Type C")
            ], deployer.address)
        ]);
        
        // Check minted stats
        totalMinted = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-minted", [], deployer.address);
        totalMinted.result.expectUint(3300); // 1000 + 1500 + 800
        
        // Retire one NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(2),
                types.utf8("Global stats retirement test")
            ], deployer.address)
        ]);
        
        // List and sell another NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(3),
                types.uint(150000) // 0.15 STX
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(3)
            ], buyer.address)
        ]);
        
        // Verify final global statistics
        totalRetired = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-retired", [], deployer.address);
        totalSold = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-sold", [], deployer.address);
        let totalFees = chain.callReadOnlyFn("Carbon-track-contract", "get-total-platform-fees", [], deployer.address);
        
        totalRetired.result.expectUint(1500); // NFT #2
        totalSold.result.expectUint(800); // NFT #3
        totalFees.result.expectUint(1500); // 1% of 150000 microSTX
    },
});

Clarinet.test({
    name: "Query functions: Non-existent data returns none correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        
        // Query non-existent NFT
        const nftData = chain.callReadOnlyFn("Carbon-track-contract", "get-carbon-nft", [types.uint(999)], deployer.address);
        nftData.result.expectNone();
        
        // Query non-existent NFT owner
        const ownerData = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-owner-readonly", [types.uint(999)], deployer.address);
        ownerData.result.expectNone();
        
        // Query non-existent marketplace listing
        const listingData = chain.callReadOnlyFn("Carbon-track-contract", "get-marketplace-listing", [types.uint(999)], deployer.address);
        listingData.result.expectNone();
        
        // Query user stats for user with no activity
        const userStats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(deployer.address)], deployer.address);
        userStats.result.expectNone();
        
        // Query non-existent certification body
        const certData = chain.callReadOnlyFn("Carbon-track-contract", "get-certification-body", [types.ascii("NON-EXISTENT")], deployer.address);
        certData.result.expectNone();
    },
});

Clarinet.test({
    name: "Admin workflow: Complete certification body lifecycle",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const newFeeCollector = accounts.get('wallet_1')!;
        const certBody1 = "CDM-UNFCCC";
        const certBody2 = "ACR-REGISTRY";
        
        // Test complete admin workflow
        let block = chain.mineBlock([
            // Verify multiple certification bodies
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody1),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody2),
                types.bool(true)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk().expectBool(true);
        block.receipts[1].result.expectOk().expectBool(true);
        
        // Verify both are active
        let cert1 = chain.callReadOnlyFn("Carbon-track-contract", "get-certification-body", [types.ascii(certBody1)], deployer.address);
        let cert2 = chain.callReadOnlyFn("Carbon-track-contract", "get-certification-body", [types.ascii(certBody2)], deployer.address);
        
        let cert1Data = cert1.result.expectSome().expectTuple() as any;
        let cert2Data = cert2.result.expectSome().expectTuple() as any;
        assertEquals(cert1Data['is-verified'], types.bool(true));
        assertEquals(cert2Data['is-verified'], types.bool(true));
        
        // Change fee collector
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "set-platform-fee-collector", [
                types.principal(newFeeCollector.address)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify new collector can manage certification bodies
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody1),
                types.bool(false) // Revoke certification
            ], newFeeCollector.address) // New collector
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify the change
        cert1 = chain.callReadOnlyFn("Carbon-track-contract", "get-certification-body", [types.ascii(certBody1)], deployer.address);
        cert1Data = cert1.result.expectSome().expectTuple() as any;
        assertEquals(cert1Data['is-verified'], types.bool(false));
        
        // Verify old collector can no longer make changes
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody2),
                types.bool(false)
            ], deployer.address) // Old collector
        ]);
        block.receipts[0].result.expectErr().expectUint(3010); // ERR-UNAUTHORIZED
    },
});
