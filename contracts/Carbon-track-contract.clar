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
