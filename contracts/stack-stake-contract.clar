;; StackStake - Automated Staking Pool Contract
;; A Clarity smart contract for automated STX staking with proportional reward distribution
;; 
;; Features:
;; - Automated staking pool for STX tokens
;; - Proportional reward distribution to stakers
;; - Configurable staking periods and reward rates
;; - Emergency withdrawal capabilities
;; - Pool management functions

;; Constants
(define-constant ERR-INSUFFICIENT-BALANCE (err u1001))
(define-constant ERR-INVALID-AMOUNT (err u1002))
(define-constant ERR-POOL-FULL (err u1003))
(define-constant ERR-NOT-STAKER (err u1004))
(define-constant ERR-POOL-EMPTY (err u1005))
(define-constant ERR-ALREADY-STAKED (err u1006))
(define-constant ERR-STAKE-PERIOD-ACTIVE (err u1007))
(define-constant ERR-STAKE-PERIOD-ENDED (err u1008))
(define-constant ERR-REWARDS-NOT-READY (err u1009))
(define-constant ERR-UNAUTHORIZED (err u1010))

;; Minimum staking amount (in microSTX)
(define-constant MINIMUM-STAKE-AMOUNT u1000000) ;; 1 STX
;; Maximum pool capacity (in microSTX)
(define-constant MAX-POOL-CAPACITY u1000000000000) ;; 1,000,000 STX
;; Default staking period (in blocks)
(define-constant DEFAULT-STAKE-PERIOD u144) ;; ~24 hours (assuming 10 min blocks)
;; Reward rate per block (in microSTX)
(define-constant REWARD-RATE-PER-BLOCK u1000) ;; 0.001 STX per block

;; Data maps and variables
;; Pool configuration
(define-data-var pool-capacity uint MAX-POOL-CAPACITY)
(define-data-var stake-period uint DEFAULT-STAKE-PERIOD)
(define-data-var reward-rate uint REWARD-RATE-PER-BLOCK)
(define-data-var pool-owner principal (as-contract tx-sender))

;; Pool state
(define-data-var total-staked uint u0)
(define-data-var total-rewards-distributed uint u0)
(define-data-var current-stake-cycle uint u0)
(define-data-var cycle-start-block uint u0)
(define-data-var is-pool-active bool true)

;; Staker information
(define-map stakers principal (tuple 
    (staked-amount uint)
    (stake-time uint)
    (cycle-staked uint)
    (rewards-claimed uint)
    (is-active bool)
))

;; Stake cycle information
(define-map stake-cycles uint (tuple
    (total-staked uint)
    (total-rewards uint)
    (start-block uint)
    (end-block uint)
    (is-complete bool)
))

;; Events
(define-event StakeEvent (principal staker, uint amount, uint cycle))
(define-event UnstakeEvent (principal staker, uint amount, uint rewards))
(define-event RewardClaimEvent (principal staker, uint amount))
(define-event PoolConfigEvent (uint new-capacity, uint new-period, uint new-rate))
