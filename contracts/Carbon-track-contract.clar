;; CarbonTrack - Carbon Credits NFT Contract
;; A Clarity smart contract for tracking carbon credits as NFTs with transparent buying, selling, and retiring
;; 
;; Features:
;; - Mint carbon credit NFTs with verified data
;; - Transparent buying and selling of carbon credits
;; - Credit retirement mechanism with proof
;; - Verification and certification system
;; - Carbon credit marketplace functionality
;; - Environmental impact tracking

;; Constants
(define-constant ERR-INSUFFICIENT-BALANCE (err u3001))
(define-constant ERR-INVALID-AMOUNT (err u3002))
(define-constant ERR-NFT-NOT-FOUND (err u3003))
(define-constant ERR-NOT-OWNER (err u3004))
(define-constant ERR-ALREADY-RETIRED (err u3005))
(define-constant ERR-NOT-RETIRED (err u3006))
(define-constant ERR-INVALID-PRICE (err u3007))
(define-constant ERR-LISTING-NOT-FOUND (err u3008))
(define-constant ERR-ALREADY-LISTED (err u3009))
(define-constant ERR-UNAUTHORIZED (err u3010))
(define-constant ERR-INVALID-CERTIFICATION (err u3011))
(define-constant ERR-INSUFFICIENT-CREDITS (err u3012))

;; Minimum carbon credit amount (in kg CO2)
(define-constant MIN-CARBON-AMOUNT u1) ;; 1 kg CO2
;; Maximum carbon credit amount (in kg CO2)
(define-constant MAX-CARBON-AMOUNT u1000000000) ;; 1 billion kg CO2
;; Minimum listing price (in microSTX)
(define-constant MIN-LISTING-PRICE u1000) ;; 0.001 STX
;; Maximum listing price (in microSTX)
(define-constant MAX-LISTING-PRICE u1000000000000) ;; 1,000,000 STX
;; Platform fee percentage (1%)
(define-constant PLATFORM-FEE-PERCENTAGE u100) ;; 1% = 100 basis points
;; Fee denominator for percentage calculations
(define-constant FEE-DENOMINATOR u10000) ;; 100% = 10000 basis points

;; Data maps and variables
;; NFT counter
(define-data-var nft-counter uint u0)
;; Total carbon credits minted
(define-data-var total-carbon-minted uint u0)
;; Total carbon credits retired
(define-data-var total-carbon-retired uint u0)
;; Total carbon credits sold
(define-data-var total-carbon-sold uint u0)
;; Platform fee collector
(define-data-var platform-fee-collector principal (as-contract tx-sender))
;; Total platform fees collected
(define-data-var total-platform-fees uint u0)

;; Carbon credit NFT information
(define-map carbon-nfts uint (tuple
    (owner principal)
    (amount uint) ;; Amount in kg CO2
    (project-name (string-ascii 100))
    (project-description (string-utf8 500))
    (certification-body (string-ascii 50))
    (certification-date uint)
    (mint-date uint)
    (retirement-date uint)
    (is-retired bool)
    (retirement-proof (string-utf8 200))
    (location (string-ascii 100))
    (project-type (string-ascii 50))
))

;; NFT ownership tracking
(define-map nft-owners uint principal)

;; Marketplace listings
(define-map marketplace-listings uint (tuple
    (nft-id uint)
    (seller principal)
    (price uint)
    (listing-date uint)
    (is-active bool)
))

;; User statistics
(define-map user-stats principal (tuple
    (total-owned uint)
    (total-sold uint)
    (total-retired uint)
    (total-purchased uint)
))

;; Certification bodies
(define-map certified-bodies (string-ascii 50) (tuple
    (is-verified bool)
    (verification-date uint)
    (total-certifications uint)
))

;; Carbon credit transactions
(define-map carbon-transactions uint (tuple
    (nft-id uint)
    (from principal)
    (to principal)
    (amount uint)
    (transaction-type (string-ascii 20)) ;; "mint", "transfer", "retire", "sell"
    (timestamp uint)
    (price uint)
))

;; Events will be implemented in later commits

;; Private functions
(define-private (validate-carbon-amount (amount uint))
    (and
        (>= amount MIN-CARBON-AMOUNT)
        (<= amount MAX-CARBON-AMOUNT)
    )
)

(define-private (validate-listing-price (price uint))
    (and
        (>= price MIN-LISTING-PRICE)
        (<= price MAX-LISTING-PRICE)
    )
)

(define-private (is-certification-body-verified (body (string-ascii 50)))
    (default-to false (get is-verified (map-get? certified-bodies body)))
)

(define-private (get-nft-owner (nft-id uint))
    (map-get? nft-owners nft-id)
)

(define-private (is-nft-owner (nft-id uint) (owner principal))
    (is-eq (get-nft-owner nft-id) (some owner))
)

(define-private (is-nft-retired (nft-id uint))
    (default-to false (get is-retired (map-get? carbon-nfts nft-id)))
)

(define-private (is-nft-listed (nft-id uint))
    (default-to false (get is-active (map-get? marketplace-listings nft-id)))
)

(define-private (calculate-platform-fee (amount uint))
    (/ (* amount PLATFORM-FEE-PERCENTAGE) FEE-DENOMINATOR)
)

(define-private (update-user-stats (user principal) (owned-delta uint) (sold-delta uint) (retired-delta uint) (purchased-delta uint))
    (let ((current-stats (default-to (tuple (total-owned u0) (total-sold u0) (total-retired u0) (total-purchased u0)) (map-get? user-stats user))))
        (map-set user-stats user (tuple
            (total-owned (+ (get total-owned current-stats) owned-delta))
            (total-sold (+ (get total-sold current-stats) sold-delta))
            (total-retired (+ (get total-retired current-stats) retired-delta))
            (total-purchased (+ (get total-purchased current-stats) purchased-delta))
        ))
    )
)

(define-private (record-transaction (nft-id uint) (from principal) (to principal) (amount uint) (transaction-type (string-ascii 20)) (price uint))
    (let ((transaction-id (+ (var-get nft-counter) u1)))
        (map-set carbon-transactions transaction-id (tuple
            (nft-id nft-id)
            (from from)
            (to to)
            (amount amount)
            (transaction-type transaction-type)
            (timestamp u0) ;; Will be updated in later commits
            (price price)
        ))
    )
)

(define-private (increment-nft-counter)
    (var-set nft-counter (+ (var-get nft-counter) u1))
)

(define-private (get-next-nft-id)
    (+ (var-get nft-counter) u1)
)
