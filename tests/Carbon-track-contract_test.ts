
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

// Commit 4: Edge Cases & Integration Tests
// Comprehensive edge cases, integration scenarios, and complete workflow testing

Clarinet.test({
    name: "Edge case: Maximum amount carbon credit minting",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "MAX-TEST-CERT";
        const maxAmount = 1000000000; // Maximum allowed: 1 billion kg CO2
        
        // Setup certification body
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        // Test maximum amount minting
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(maxAmount),
                types.ascii("Maximum Capacity Project"),
                types.utf8("Testing maximum allowable carbon credit amount"),
                types.ascii(certificationBody),
                types.ascii("Global Scale"),
                types.ascii("Mixed")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectUint(1);
        
        // Verify the amount was recorded correctly
        const nftData = chain.callReadOnlyFn("Carbon-track-contract", "get-carbon-nft", [types.uint(1)], deployer.address);
        const nft = nftData.result.expectSome().expectTuple() as any;
        assertEquals(nft['amount'], types.uint(maxAmount));
        
        // Test exceeding maximum amount fails
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(maxAmount + 1), // Exceeds maximum
                types.ascii("Over Maximum Project"),
                types.utf8("Testing over maximum"),
                types.ascii(certificationBody),
                types.ascii("Invalid"),
                types.ascii("Test")
            ], deployer.address)
        ]);
        
        block.receipts[0].result.expectErr().expectUint(3002); // ERR-INVALID-AMOUNT
    },
});

Clarinet.test({
    name: "Edge case: Maximum price marketplace listing",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "PRICE-TEST";
        const maxPrice = 1000000000000; // Maximum: 1,000,000 STX
        
        // Setup and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(5000),
                types.ascii("High Value Project"),
                types.utf8("Project for maximum price testing"),
                types.ascii(certificationBody),
                types.ascii("Premium Location"),
                types.ascii("Premium Type")
            ], deployer.address)
        ]);
        
        // Test maximum price listing
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(maxPrice)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Test exceeding maximum price fails
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(3000),
                types.ascii("Over Price Project"),
                types.utf8("Testing over max price"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(2),
                types.uint(maxPrice + 1) // Exceeds maximum
            ], deployer.address)
        ]);
        
        block.receipts[0].result.expectErr().expectUint(3007); // ERR-INVALID-PRICE
    },
});

Clarinet.test({
    name: "Integration: Complete carbon credit lifecycle workflow",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const seller = accounts.get('wallet_1')!;
        const buyer = accounts.get('wallet_2')!;
        const newFeeCollector = accounts.get('wallet_3')!;
        const certBody = "LIFECYCLE-TEST";
        
        // Step 1: Admin setup - verify certification body and change fee collector
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "set-platform-fee-collector", [
                types.principal(newFeeCollector.address)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk().expectBool(true);
        block.receipts[1].result.expectOk().expectBool(true);
        
        // Step 2: Mint multiple NFTs to seller
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(2000),
                types.ascii("Lifecycle NFT 1"),
                types.utf8("First NFT in complete lifecycle test"),
                types.ascii(certBody),
                types.ascii("Location 1"),
                types.ascii("Type 1")
            ], seller.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1500),
                types.ascii("Lifecycle NFT 2"),
                types.utf8("Second NFT in complete lifecycle test"),
                types.ascii(certBody),
                types.ascii("Location 2"),
                types.ascii("Type 2")
            ], seller.address)
        ]);
        
        // Step 3: Transfer one NFT to deployer
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "transfer-carbon-credit", [
                types.uint(2),
                types.principal(deployer.address)
            ], seller.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Step 4: List first NFT for sale
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(500000) // 0.5 STX
            ], seller.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Step 5: Buyer purchases the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], buyer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Step 6: Retire the purchased NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("Retired for corporate sustainability - Integration Test")
            ], buyer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Step 7: Retire the transferred NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(2),
                types.utf8("Retired for personal offset - Integration Test")
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verification: Check final state
        // Verify global statistics
        const totalMinted = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-minted", [], deployer.address);
        const totalSold = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-sold", [], deployer.address);
        const totalRetired = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-retired", [], deployer.address);
        const totalFees = chain.callReadOnlyFn("Carbon-track-contract", "get-total-platform-fees", [], deployer.address);
        
        totalMinted.result.expectUint(3500); // 2000 + 1500
        totalSold.result.expectUint(2000); // NFT 1 sold
        totalRetired.result.expectUint(3500); // Both NFTs retired
        totalFees.result.expectUint(5000); // 1% of 500000 microSTX
        
        // Verify user statistics
        const sellerStats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(seller.address)], deployer.address);
        const buyerStats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(buyer.address)], deployer.address);
        const deployerStats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(deployer.address)], deployer.address);
        
        const sellerData = sellerStats.result.expectSome().expectTuple() as any;
        const buyerData = buyerStats.result.expectSome().expectTuple() as any;
        const deployerData = deployerStats.result.expectSome().expectTuple() as any;
        
        // Seller: minted 3500, sold 2000, still has 0 (transferred 1500, sold 2000)
        assertEquals(sellerData['total-sold'], types.uint(2000));
        
        // Buyer: purchased and retired 2000
        assertEquals(buyerData['total-purchased'], types.uint(2000));
        assertEquals(buyerData['total-retired'], types.uint(2000));
        
        // Deployer: received 1500 via transfer and retired it
        assertEquals(deployerData['total-retired'], types.uint(1500));
        
        // Verify fee collector received fees
        const feeCollector = chain.callReadOnlyFn("Carbon-track-contract", "get-platform-fee-collector", [], deployer.address);
        feeCollector.result.expectPrincipal(newFeeCollector.address);
    },
});

Clarinet.test({
    name: "Edge case: Multiple marketplace operations on same NFT",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const certificationBody = "MULTI-OP-TEST";
        
        // Setup and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1000),
                types.ascii("Multi Operation Test"),
                types.utf8("Testing multiple operations"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // List the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(200000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try to list again - should fail (already listed)
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(250000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(3009); // ERR-ALREADY-LISTED
        
        // Try to transfer while listed - should fail
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "transfer-carbon-credit", [
                types.uint(1),
                types.principal(user1.address)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(3009); // ERR-ALREADY-LISTED
        
        // Unlist and then transfer successfully
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "unlist-carbon-credit", [
                types.uint(1)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "transfer-carbon-credit", [
                types.uint(1),
                types.principal(user1.address)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify ownership changed
        const owner = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-owner-readonly", [types.uint(1)], deployer.address);
        owner.result.expectSome().expectPrincipal(user1.address);
    },
});

Clarinet.test({
    name: "Edge case: User statistics boundary conditions",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;
        const certificationBody = "STATS-BOUNDARY-TEST";
        
        // Setup
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        // User1 mints, transfers, and receives in complex pattern
        block = chain.mineBlock([
            // User1 mints NFT #1
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(500),
                types.ascii("Stats Test 1"),
                types.utf8("First stats test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location A"),
                types.ascii("Type A")
            ], user1.address),
            // User1 mints NFT #2
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(800),
                types.ascii("Stats Test 2"),
                types.utf8("Second stats test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location B"),
                types.ascii("Type B")
            ], user1.address)
        ]);
        
        // User1 transfers NFT #1 to user2
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "transfer-carbon-credit", [
                types.uint(1),
                types.principal(user2.address)
            ], user1.address)
        ]);
        
        // User2 lists and user1 buys back their own original NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(100000)
            ], user2.address)
        ]);
        
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], user1.address) // User1 buying back their original NFT
        ]);
        
        // User1 retires both NFTs
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("Retired original NFT after buyback")
            ], user1.address),
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(2),
                types.utf8("Retired second NFT")
            ], user1.address)
        ]);
        
        // Verify complex user statistics
        const user1Stats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(user1.address)], deployer.address);
        const user2Stats = chain.callReadOnlyFn("Carbon-track-contract", "get-user-stats", [types.principal(user2.address)], deployer.address);
        
        const u1Stats = user1Stats.result.expectSome().expectTuple() as any;
        const u2Stats = user2Stats.result.expectSome().expectTuple() as any;
        
        // User1: Originally minted 1300 (500+800), then bought back 500. 
        // total-owned tracks cumulative amounts owned, not decremented on transfer
        // Initial mint: 1300, then purchase: +500 = 1800 total ever owned
        assertEquals(u1Stats['total-owned'], types.uint(1800)); // Total amount ever owned (initial 1300 + purchased back 500)
        assertEquals(u1Stats['total-purchased'], types.uint(500)); // Bought back NFT #1
        assertEquals(u1Stats['total-retired'], types.uint(1300)); // Retired both NFTs
        
        // User2: Received 500 via transfer, sold 500, but total-owned is cumulative
        assertEquals(u2Stats['total-sold'], types.uint(500)); // Sold NFT #1
        assertEquals(u2Stats['total-owned'], types.uint(500)); // Total amount ever owned (received via transfer)
    },
});

Clarinet.test({
    name: "Integration: Platform fee collection across multiple sales",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const seller1 = accounts.get('wallet_1')!;
        const seller2 = accounts.get('wallet_2')!;
        const buyer1 = accounts.get('wallet_3')!;
        const buyer2 = accounts.get('wallet_4')!;
        const certificationBody = "FEE-INTEGRATION-TEST";
        
        // Setup
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        // Multiple sellers mint NFTs
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1000),
                types.ascii("Fee Test 1"),
                types.utf8("First fee test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location 1"),
                types.ascii("Type 1")
            ], seller1.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(2000),
                types.ascii("Fee Test 2"),
                types.utf8("Second fee test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location 2"),
                types.ascii("Type 2")
            ], seller2.address)
        ]);
        
        // Multiple sales with different prices
        const price1 = 300000; // 0.3 STX - fee: 3000 microSTX
        const price2 = 750000; // 0.75 STX - fee: 7500 microSTX
        const expectedTotalFees = 10500; // 3000 + 7500
        
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(price1)
            ], seller1.address),
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(2),
                types.uint(price2)
            ], seller2.address)
        ]);
        
        // Initial fees should be 0
        let totalFees = chain.callReadOnlyFn("Carbon-track-contract", "get-total-platform-fees", [], deployer.address);
        totalFees.result.expectUint(0);
        
        // First sale
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(1)
            ], buyer1.address)
        ]);
        
        // Check fees after first sale
        totalFees = chain.callReadOnlyFn("Carbon-track-contract", "get-total-platform-fees", [], deployer.address);
        totalFees.result.expectUint(3000); // 1% of 300000
        
        // Second sale
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "buy-carbon-credit", [
                types.uint(2)
            ], buyer2.address)
        ]);
        
        // Check final accumulated fees
        totalFees = chain.callReadOnlyFn("Carbon-track-contract", "get-total-platform-fees", [], deployer.address);
        totalFees.result.expectUint(expectedTotalFees);
        
        // Verify sales statistics
        const totalSold = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-sold", [], deployer.address);
        totalSold.result.expectUint(3000); // 1000 + 2000
    },
});

Clarinet.test({
    name: "Edge case: NFT operations after retirement",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const certificationBody = "POST-RETIREMENT-TEST";
        
        // Setup and mint NFT
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(1200),
                types.ascii("Post Retirement Test"),
                types.utf8("Testing operations after retirement"),
                types.ascii(certificationBody),
                types.ascii("Test Location"),
                types.ascii("Test Type")
            ], deployer.address)
        ]);
        
        // Retire the NFT
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("Initial retirement for testing")
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // All subsequent operations should fail on retired NFT
        
        // Try to transfer - should fail
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "transfer-carbon-credit", [
                types.uint(1),
                types.principal(user1.address)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(3005); // ERR-ALREADY-RETIRED
        
        // Try to list - should fail
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "list-carbon-credit", [
                types.uint(1),
                types.uint(100000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(3005); // ERR-ALREADY-RETIRED
        
        // Try to retire again - should fail
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("Second retirement attempt")
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(3005); // ERR-ALREADY-RETIRED
        
        // Verify NFT is still marked as retired with original proof
        const nftData = chain.callReadOnlyFn("Carbon-track-contract", "get-carbon-nft", [types.uint(1)], deployer.address);
        const nft = nftData.result.expectSome().expectTuple() as any;
        assertEquals(nft['is-retired'], types.bool(true));
        assertEquals(nft['retirement-proof'], types.utf8("Initial retirement for testing"));
    },
});

Clarinet.test({
    name: "Integration: Mass operations stress test",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const certificationBody = "MASS-OPERATIONS-TEST";
        
        // Setup
        let block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "verify-certification-body", [
                types.ascii(certificationBody),
                types.bool(true)
            ], deployer.address)
        ]);
        
        // Mass mint operation - 5 NFTs in one block
        const nftAmounts = [1000, 1500, 2000, 2500, 3000];
        const totalExpectedAmount = 10000;
        
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(nftAmounts[0]),
                types.ascii("Mass Test 1"),
                types.utf8("First mass test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location 1"),
                types.ascii("Type 1")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(nftAmounts[1]),
                types.ascii("Mass Test 2"),
                types.utf8("Second mass test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location 2"),
                types.ascii("Type 2")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(nftAmounts[2]),
                types.ascii("Mass Test 3"),
                types.utf8("Third mass test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location 3"),
                types.ascii("Type 3")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(nftAmounts[3]),
                types.ascii("Mass Test 4"),
                types.utf8("Fourth mass test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location 4"),
                types.ascii("Type 4")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "mint-carbon-credit", [
                types.uint(nftAmounts[4]),
                types.ascii("Mass Test 5"),
                types.utf8("Fifth mass test NFT"),
                types.ascii(certificationBody),
                types.ascii("Location 5"),
                types.ascii("Type 5")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 5);
        // Verify all mints succeeded
        for (let i = 0; i < 5; i++) {
            block.receipts[i].result.expectOk().expectUint(i + 1);
        }
        
        // Verify total minted amount
        const totalMinted = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-minted", [], deployer.address);
        totalMinted.result.expectUint(totalExpectedAmount);
        
        // Mass retirement operation - retire all 5 NFTs
        block = chain.mineBlock([
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(1),
                types.utf8("Mass retirement 1")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(2),
                types.utf8("Mass retirement 2")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(3),
                types.utf8("Mass retirement 3")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(4),
                types.utf8("Mass retirement 4")
            ], deployer.address),
            Tx.contractCall("Carbon-track-contract", "retire-carbon-credit", [
                types.uint(5),
                types.utf8("Mass retirement 5")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 5);
        // Verify all retirements succeeded
        for (let i = 0; i < 5; i++) {
            block.receipts[i].result.expectOk().expectBool(true);
        }
        
        // Verify total retired amount
        const totalRetired = chain.callReadOnlyFn("Carbon-track-contract", "get-total-carbon-retired", [], deployer.address);
        totalRetired.result.expectUint(totalExpectedAmount);
        
        // Verify NFT counter
        const nftCounter = chain.callReadOnlyFn("Carbon-track-contract", "get-nft-counter", [], deployer.address);
        nftCounter.result.expectUint(5);
    },
});
