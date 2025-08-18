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

;; Constants (error codes as uints)
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
(define-data-var platform-fee-collector principal tx-sender)
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
            (timestamp block-height)
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

;; Public functions
(define-public (mint-carbon-credit 
    (amount uint) 
    (project-name (string-ascii 100)) 
    (project-description (string-utf8 500)) 
    (certification-body (string-ascii 50)) 
    (location (string-ascii 100)) 
    (project-type (string-ascii 50)))
    (let ((nft-id (get-next-nft-id)))
        (if (and (validate-carbon-amount amount) (is-certification-body-verified certification-body))
            (begin
                ;; Create the carbon credit NFT
                (map-set carbon-nfts nft-id (tuple
                    (owner tx-sender)
                    (amount amount)
                    (project-name project-name)
                    (project-description project-description)
                    (certification-body certification-body)
                    (certification-date block-height)
                    (mint-date block-height)
                    (retirement-date u0)
                    (is-retired false)
                    (retirement-proof u"")
                    (location location)
                    (project-type project-type)
                ))
                
                ;; Set ownership
                (map-set nft-owners nft-id tx-sender)
                
                ;; Update global statistics
                (var-set total-carbon-minted (+ (var-get total-carbon-minted) amount))
                
                ;; Update user statistics
                (update-user-stats tx-sender amount u0 u0 u0)
                
                ;; Record transaction
                (record-transaction nft-id tx-sender tx-sender amount "mint" u0)
                
                ;; Increment NFT counter
                (increment-nft-counter)
                
                ;; Return success
                (ok nft-id)
            )
            (if (not (validate-carbon-amount amount)) 
                ERR-INVALID-AMOUNT 
                ERR-INVALID-CERTIFICATION)
        )
    )
)

(define-public (transfer-carbon-credit (nft-id uint) (new-owner principal))
    (let ((nft-data (unwrap! (map-get? carbon-nfts nft-id) ERR-NFT-NOT-FOUND)))
        (begin
            ;; Validate NFT exists and sender is owner
            (asserts! (is-nft-owner nft-id tx-sender) ERR-NOT-OWNER)
            (asserts! (not (is-nft-retired nft-id)) ERR-ALREADY-RETIRED)
            (asserts! (not (is-nft-listed nft-id)) ERR-ALREADY-LISTED)
            
            ;; Update NFT owner
            (map-set carbon-nfts nft-id (merge nft-data (tuple (owner new-owner))))
            (map-set nft-owners nft-id new-owner)
            
            ;; Update user statistics
            (update-user-stats tx-sender u0 u0 u0 u0)
            (update-user-stats new-owner (get amount nft-data) u0 u0 u0)
            
            ;; Record transaction
            (record-transaction nft-id tx-sender new-owner (get amount nft-data) "transfer" u0)
            
            ;; Return success
            (ok true)
        )
    )
)

(define-public (retire-carbon-credit (nft-id uint) (retirement-proof (string-utf8 200)))
    (let ((nft-data (unwrap! (map-get? carbon-nfts nft-id) ERR-NFT-NOT-FOUND)))
        (begin
            ;; Validate NFT exists and sender is owner
            (asserts! (is-nft-owner nft-id tx-sender) ERR-NOT-OWNER)
            (asserts! (not (is-nft-retired nft-id)) ERR-ALREADY-RETIRED)
            
            ;; Mark NFT as retired
            (map-set carbon-nfts nft-id (merge nft-data (tuple 
                (is-retired true)
                (retirement-proof retirement-proof)
                (retirement-date block-height)
            )))
            
            ;; Update global statistics
            (var-set total-carbon-retired (+ (var-get total-carbon-retired) (get amount nft-data)))
            
            ;; Update user statistics
            (update-user-stats tx-sender u0 u0 (get amount nft-data) u0)
            
            ;; Record transaction
            (record-transaction nft-id tx-sender tx-sender (get amount nft-data) "retire" u0)
            
            ;; Return success
            (ok true)
        )
    )
)

(define-public (list-carbon-credit (nft-id uint) (price uint))
    (let ((nft-data (unwrap! (map-get? carbon-nfts nft-id) ERR-NFT-NOT-FOUND)))
        (begin
            ;; Validate NFT exists and sender is owner
            (asserts! (is-nft-owner nft-id tx-sender) ERR-NOT-OWNER)
            (asserts! (not (is-nft-retired nft-id)) ERR-ALREADY-RETIRED)
            (asserts! (not (is-nft-listed nft-id)) ERR-ALREADY-LISTED)
            (asserts! (validate-listing-price price) ERR-INVALID-PRICE)
            
            ;; Create marketplace listing
            (map-set marketplace-listings nft-id (tuple
                (nft-id nft-id)
                (seller tx-sender)
                (price price)
                (listing-date block-height)
                (is-active true)
            ))
            
            ;; Return success
            (ok true)
        )
    )
)

;; Marketplace functions
(define-public (buy-carbon-credit (nft-id uint))
    (let ((listing (unwrap! (map-get? marketplace-listings nft-id) ERR-LISTING-NOT-FOUND))
          (nft-data (unwrap! (map-get? carbon-nfts nft-id) ERR-NFT-NOT-FOUND)))
        (begin
            ;; Validate listing exists and is active
            (asserts! (get is-active listing) ERR-LISTING-NOT-FOUND)
            (asserts! (not (is-eq tx-sender (get seller listing))) ERR-UNAUTHORIZED)
            
            ;; Calculate platform fee
            (let ((platform-fee (calculate-platform-fee (get price listing)))
                  (seller-amount (- (get price listing) platform-fee)))
                (begin
                    ;; Transfer STX to seller (minus platform fee)
                    (try! (stx-transfer? seller-amount tx-sender (get seller listing)))
                    
                    ;; Transfer platform fee to fee collector
                    (try! (stx-transfer? platform-fee tx-sender (var-get platform-fee-collector)))
                    
                    ;; Update platform fees
                    (var-set total-platform-fees (+ (var-get total-platform-fees) platform-fee))
                    
                    ;; Transfer NFT ownership
                    (map-set carbon-nfts nft-id (merge nft-data (tuple (owner tx-sender))))
                    (map-set nft-owners nft-id tx-sender)
                    
                    ;; Remove listing
                    (map-set marketplace-listings nft-id (merge listing (tuple (is-active false))))
                    
                    ;; Update global statistics
                    (var-set total-carbon-sold (+ (var-get total-carbon-sold) (get amount nft-data)))
                    
                    ;; Update user statistics
                    (update-user-stats (get seller listing) u0 (get amount nft-data) u0 u0)
                    (update-user-stats tx-sender (get amount nft-data) u0 u0 (get amount nft-data))
                    
                    ;; Record transaction
                    (record-transaction nft-id (get seller listing) tx-sender (get amount nft-data) "sell" (get price listing))
                    
                    ;; Return success
                    (ok true)
                )
            )
        )
    )
)

(define-public (unlist-carbon-credit (nft-id uint))
    (let ((listing (unwrap! (map-get? marketplace-listings nft-id) ERR-LISTING-NOT-FOUND)))
        (begin
            ;; Validate listing exists and sender is seller
            (asserts! (is-eq tx-sender (get seller listing)) ERR-NOT-OWNER)
            (asserts! (get is-active listing) ERR-LISTING-NOT-FOUND)
            
            ;; Remove listing
            (map-set marketplace-listings nft-id (merge listing (tuple (is-active false))))
            
            ;; Return success
            (ok true)
        )
    )
)

;; Admin functions
(define-public (verify-certification-body (body (string-ascii 50)) (is-verified bool))
    (begin
        ;; Only platform fee collector can verify certification bodies
        (asserts! (is-eq tx-sender (var-get platform-fee-collector)) ERR-UNAUTHORIZED)
        
        ;; Update certification body status
        (map-set certified-bodies body (tuple
            (is-verified is-verified)
            (verification-date block-height)
            (total-certifications u0)
        ))
        
        ;; Return success
        (ok true)
    )
)

(define-public (set-platform-fee-collector (new-collector principal))
    (begin
        ;; Only current fee collector can change the collector
        (asserts! (is-eq tx-sender (var-get platform-fee-collector)) ERR-UNAUTHORIZED)
        
        ;; Update fee collector
        (var-set platform-fee-collector new-collector)
        
        ;; Return success
        (ok true)
    )
)

;; Query functions
(define-read-only (get-carbon-nft (nft-id uint))
    (map-get? carbon-nfts nft-id)
)

(define-read-only (get-nft-owner-readonly (nft-id uint))
    (map-get? nft-owners nft-id)
)

(define-read-only (get-marketplace-listing (nft-id uint))
    (map-get? marketplace-listings nft-id)
)

(define-read-only (get-user-stats (user principal))
    (map-get? user-stats user)
)

(define-read-only (get-certification-body (body (string-ascii 50)))
    (map-get? certified-bodies body)
)

(define-read-only (get-total-carbon-minted)
    (var-get total-carbon-minted)
)

(define-read-only (get-total-carbon-retired)
    (var-get total-carbon-retired)
)

(define-read-only (get-total-carbon-sold)
    (var-get total-carbon-sold)
)

(define-read-only (get-total-platform-fees)
    (var-get total-platform-fees)
)

(define-read-only (get-platform-fee-collector)
    (var-get platform-fee-collector)
)

(define-read-only (get-nft-counter)
    (var-get nft-counter)
)