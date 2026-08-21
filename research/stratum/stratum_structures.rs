// Braidpool stratum layer — key data structures and methods
// Source: node/src/stratum.rs (dev branch, 2026-08-21)
// Not executable. Use as a reading reference alongside the actual source.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};

// ─────────────────────────────────────────────
// BLOCK TEMPLATE
// ─────────────────────────────────────────────

// Mirrors Bitcoin Core's getblocktemplate response.
// Constructed in ipc_template_consumer (lib.rs) from the raw IPC payload,
// then carried in JobDetails and cloned once per miner per broadcast — the
// clone is the memory cost that #492 (GlobalJobStore) exists to remove.
// Vec<Transaction> is ~100–500 KB with a populated mempool.
pub struct BlockTemplate {
    pub version: bitcoin::block::Version,
    pub previousblockhash: BlockHash,
    pub transactions: Vec<Transaction>,   // full tx list — only consumed on full-block-found
    pub coinbasevalue: Option<u64>,
    pub target: bitcoin::Target,
    pub curtime: bitcoin::time::BlockTime,
    pub bits: bitcoin::CompactTarget,
    pub height: bitcoin::absolute::Height,
    pub default_witness_commitment: Option<Witness>,
    // ... other optional GBT fields (rules, mutable, noncerange, etc.)
}

// ─────────────────────────────────────────────
// STRATUM SERVER CONFIG
// ─────────────────────────────────────────────

// Passed to Server::new() and threaded into every connection handler.
// audit_mode branches nearly every downstream code path — authorize, subscribe,
// submit, extranonce assignment all have separate logic trees when true.
// start_difficulty / minimum_difficulty are both 1 by default, which causes
// ASIC hardware to flood the handler; exposed as CLI args on bitaxe_setup branch.
pub struct StratumServerConfig {
    pub hostname: String,           // bind address, default "0.0.0.0"
    pub start_difficulty: u64,      // initial difficulty for new connections
    pub minimum_difficulty: u64,    // floor; miner-suggested values clamped to this
    pub maximum_difficulty: Option<u64>,
    pub solo_address: Option<String>,
    pub audit_mode: bool,           // proxy mode — upstream pool is involved
    pub audit_miner_difficulty: Option<f64>,
}

// ─────────────────────────────────────────────
// DOWNSTREAM CLIENT
// ─────────────────────────────────────────────

// Per-connection state. Created when a TCP connection is accepted, lives for
// the duration of the connection inside handle_connection (wrapped in Arc<Mutex>).
// Mutated by each Stratum method handler as the handshake progresses:
//   subscribe -> subscribed = true, extranonce1 assigned
//   configure -> version_rolling_mask negotiated
//   authorize -> authorized = true, payout_address set
// connection_id is private — only readable via connection_id() accessor to
// prevent mutation after the initial atomic assignment.
pub struct DownstreamClient {
    pub authorized: bool,
    pub subscribed: bool,
    pub suggest_difficulty_done: bool,
    pub channel_configured: bool,
    pub downstream_ip: String,

    connection_id: u32,             // private — read via connection_id()
    extranonce1: Vec<u8>,           // 8 bytes, unique per connection

    pub extranonce_history: VecDeque<Vec<u8>>, // audit mode: tracks extranonce commitments
    pub extranonce2_prefix: Option<Vec<u8>>,   // audit mode: 2-byte prefix for upstream routing
    pub miner_extranonce2_size: usize,         // rollable bits the miner controls
    pub extranonce2_len: usize,

    version_rolling_mask: Option<String>,      // BIP310 negotiated mask
    version_rolling_min_bit: Option<u32>,

    pub monitor_target: Option<bitcoin::Target>, // stricter target for health sampling
    pub block_submission_tx: Option<mpsc::UnboundedSender<BlockSubmissionRequest>>,

    // Audit mode only
    pub is_proxy_mode: bool,
    pub payout_address: Option<String>,
    pub audit_miner_difficulty: Option<f64>,
}

impl DownstreamClient {
    // Read-only accessor keeps connection_id immutable after assignment.
    pub fn connection_id(&self) -> u32 { self.connection_id }

    // Central dispatch for all client→server Stratum messages.
    // Routes by method string to the appropriate handler.
    // After authorize+subscribe both complete, triggers SendLatestTemplateToNewDownstream
    // so the miner gets work immediately without waiting for the next block.
    pub async fn handle_client_to_server_request(
        &mut self,
        client_request: StandardRequest,
        mining_job_map: Arc<Mutex<MiningJobMap>>,
        response_sender: mpsc::Sender<String>,
        notification_sender: mpsc::Sender<NotifyCmd>,
        peer_addr: String,
        swarm_handler: Arc<Mutex<SwarmHandler>>,
    ) -> Result<StratumResponses, StratumErrors> { /* ... */ }

    // Called when miner sends mining.suggest_difficulty.
    // Clamps the miner-suggested value to minimum_difficulty so a high-hashrate
    // device (e.g. Bitaxe at 400 GH/s) cannot set difficulty below the floor.
    pub async fn suggest_difficulty(
        &mut self,
        difficulty_u64: u64,
    ) -> Result<StratumResponses, StratumErrors> {
        self.suggest_difficulty_done = true;
        let clamped = difficulty_u64.max(self.minimum_difficulty);
        // returns SuggestDifficultyResponse { method: "mining.set_difficulty", params: [clamped] }
    }

    // Handles mining.submit. Key steps:
    //   1. Parse ntime (u32) and nonce (4 bytes, accepts unpadded hex)
    //   2. Look up job in MiningJobMap by numeric job_id
    //   3. Reconstruct coinbase, build merkle root, build block header
    //   4. Check against weak share target (always) and Bitcoin target (if met, submit block)
    //   5. Increment accepted/stale/invalid share counters
    pub async fn handle_submit(
        &mut self,
        client_request: StandardRequest,
        mining_job_map: Arc<Mutex<MiningJobMap>>,
        // ...
    ) -> Result<StratumResponses, StratumErrors> { /* ... */ }
}

// ─────────────────────────────────────────────
// JOB DETAILS
// ─────────────────────────────────────────────

// What gets stored per job in MiningJobMap.
// blocktemplate carries the full Vec<Transaction> — this is the per-miner
// clone that causes O(N * template_size) memory usage on every broadcast.
// #492 replaces this with Arc<JobDetails> in a GlobalJobStore so the template
// is allocated once and shared across all miners.
pub struct JobDetails {
    pub blocktemplate: BlockTemplate,       // full template including transactions
    pub coinbase1: String,
    pub coinbase2: String,
    pub coinbase_merkle_path: Vec<String>,
    pub coinbase_witness_commitment: Option<Witness>,
    pub job_sent_time: u32,                 // Unix timestamp at send time
    pub is_upstream_job: bool,
}

// ─────────────────────────────────────────────
// MINING JOB MAP
// ─────────────────────────────────────────────

// Per-miner job store (pre-#492). Each connected miner has its own
// Arc<Mutex<MiningJobMap>> inside job_map_arc: HashMap<peer_addr, ...>
// in Notifier. On every broadcast the notify loop iterates all miners
// and inserts a full JobDetails clone into each map — O(N * template_size).
//
// No capacity field here (confirmed on dev branch 2026-08-21) — #492 has
// not merged, so growth is still unbounded: every template adds an entry
// to every miner's map until the connection drops.
//
// Two separate numeric-ID hashmaps (mining_jobs, job_id_to_template) to
// support both internal template-based lookup and miner-facing job_id
// lookup on mining.submit. string_job_id_map handles upstream (audit mode)
// jobs that arrive with arbitrary string IDs from the upstream pool.
pub struct MiningJobMap {
    mining_jobs: HashMap<TemplateId, JobDetails>,           // template_id → job
    job_id_to_template: HashMap<u64, TemplateId>,           // numeric job_id → template_id
    next_job_id: u64,                                       // monotonically increasing
    string_job_id_map: HashMap<String, (TemplateId, JobDetails)>, // upstream string job_id
}

impl MiningJobMap {
    // Inserts a job and returns the numeric job_id sent to the miner.
    pub async fn insert_mining_job(&mut self, template_id: TemplateId, job_details: JobDetails) -> u64 { /* ... */ }

    // Upstream/audit mode path — stores by original string job_id from upstream pool.
    pub async fn insert_upstream_job(&mut self, upstream_job_id: String, template_id: TemplateId, job_details: JobDetails) -> String { /* ... */ }

    // Called on upstream disconnect to drop stale jobs so miners don't submit
    // against jobs the upstream pool no longer recognises.
    pub fn clear_upstream_jobs(&mut self) { /* ... */ }

    // Three lookup paths for mining.submit, depending on how the job was stored:
    pub fn get_by_job_id(&self, job_id: u64) -> Result<&JobDetails, StratumErrors> { /* ... */ }
    pub fn get_by_template_id(&self, template_id: &TemplateId) -> Result<&JobDetails, StratumErrors> { /* ... */ }
    pub fn get_by_string_job_id(&self, job_id_str: &str) -> Result<(&JobDetails, &TemplateId), StratumErrors> { /* ... */ }
}

// ─────────────────────────────────────────────
// NOTIFY CMD
// ─────────────────────────────────────────────

// The channel type between ipc_template_consumer (lib.rs) and Notifier::run_notifier.
// SendToAll is the hot path — fires on every new block template from Bitcoin Core.
// template_ready_at is captured in ipc_template_consumer after mutex guards drop,
// threaded here so run_notifier can compute per-miner delivery latency.
pub enum NotifyCmd {
    // Broadcast new template to all connected miners.
    SendToAll {
        template: BlockTemplate,
        merkle_branch_coinbase: Vec<Vec<u8>>,
        template_id: TemplateId,
        template_ready_at: std::time::Instant, // reference point for per-miner latency logging
    },
    // Send latest available template to a miner that just connected and completed handshake.
    SendLatestTemplateToNewDownstream {
        new_downstream_addr: String,
    },
    // Audit mode: forward an upstream pool job directly to connected miners.
    SendUpstreamJob {
        job_notification: JobNotification,
    },
    // Push a difficulty change to all miners.
    BroadcastDifficulty {
        difficulty: f64,
    },
    // Update the bead hash commitment embedded in extranonce1 on new DAG tip.
    UpdateExtranonce {
        new_bead_hash: bitcoin::BlockHash,
    },
}

// ─────────────────────────────────────────────
// NOTIFIER
// ─────────────────────────────────────────────

// Owns the receiving end of the NotifyCmd channel and the per-peer job map.
// run_notifier is a long-running task that loops on notification_receiver.
// For SendToAll it iterates job_map_arc (all miners), constructs a personalized
// JobDetails for each, inserts it into that miner's MiningJobMap, then sends
// the serialized mining.notify JSON to the miner's outbound channel (sender).
//
// The sequential await on each miner's sender.send() is the slow-miner
// backpressure problem: one miner with a full 1024-capacity channel stalls
// delivery to all miners iterated after it. (Issue 5 in scalability roadmap.)
pub struct Notifier {
    notification_receiver: mpsc::Receiver<NotifyCmd>,
    pub job_map_arc: Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>,
}

impl Notifier {
    pub fn new(
        notification_rx: mpsc::Receiver<NotifyCmd>,
        job_map_arc: Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>,
    ) -> Self { /* ... */ }

    // Main notify loop. Receives NotifyCmd and fans out to all miners.
    // Also handles SendLatestTemplateToNewDownstream for newly connected miners.
    pub async fn run_notifier(
        &mut self,
        downstream_connection_map: Arc<RwLock<ConnectionMapping>>,
        latest_template_arc: &mut Arc<Mutex<BlockTemplate>>,
        latest_template_merkle_branch_arc: &mut Arc<Mutex<Vec<Vec<u8>>>>,
        latest_template_id: Arc<Mutex<TemplateId>>,
        upstream_cache: Option<Arc<tokio::sync::RwLock<UpstreamCache>>>,
        audit_dag: Option<Arc<Mutex<AuditDAG>>>,
    ) -> Result<(), StratumErrors> { /* ... */ }

    // Builds the mining.notify parameters from a template.
    // Applies reverse_four_byte_chunks to prevhash (GBT returns big-endian,
    // Stratum V1 requires little-endian in 4-byte reversed chunks).
    pub async fn construct_job_notification(
        clean_job: bool,
        notified_template: BlockTemplate,
        template_id: TemplateId,
        merkle_branch_coinbase: Vec<Vec<u8>>,
    ) -> Result<JobNotification, StratumErrors> { /* ... */ }
}

// ─────────────────────────────────────────────
// CONNECTION INFO
// ─────────────────────────────────────────────

// What ConnectionMapping stores per live connection.
// sender is the miner's outbound channel — bounded at DOWNSTREAM_CHANNEL_CAPACITY (1024).
// control_tx is for internal signals (disconnect, etc.) separate from the data path.
pub struct ConnectionInfo {
    pub connection_id: u32,
    pub sender: mpsc::Sender<String>,        // outbound mining.notify / mining.set_difficulty
    pub control_tx: mpsc::Sender<ControlMsg>,
}

// ─────────────────────────────────────────────
// CONNECTION MAPPING
// ─────────────────────────────────────────────

// Global registry of all live downstream connections, wrapped in Arc<RwLock<...>>
// so both Notifier and per-connection handlers can read/write concurrently.
//
// Prefix allocation (audit mode): available_prefixes is a VecDeque<u16> giving
// O(1) reuse of released prefixes — pop_front on connect, push_back on disconnect.
// next_extranonce2_prefix starts at 1 and increments; wraps are warned via
// PREFIX_EXHAUSTION_WARNING_THRESHOLD (60000).
//
// current_bead_commitment: 5-byte slice of the latest bead hash, embedded in
// each new miner's extranonce1 so submitted shares are tied to a DAG tip.
pub struct ConnectionMapping {
    pub downstream_channel_mapping: HashMap<String, ConnectionInfo>, // peer_addr → info
    worker_to_peer: HashMap<String, String>,   // worker_name → peer_addr (for audit routing)
    pub assigned_prefixes: HashMap<String, u16>, // peer_addr → allocated prefix
    available_prefixes: VecDeque<u16>,           // released prefixes ready for reuse
    next_extranonce2_prefix: u16,

    pub upstream_extranonce1: Option<String>,
    pub upstream_extranonce2_size: Option<usize>,
    pub upstream_difficulty: Option<f64>,
    pub upstream_connected: bool,

    pub current_bead_commitment: Vec<u8>,        // 5 bytes (COMMITMENT_SIZE)
}

impl ConnectionMapping {
    // Allocates a unique 2-byte prefix for audit mode extranonce partitioning.
    // Tries to reuse a released prefix first; allocates a new one if none available.
    pub fn allocate_extranonce2_prefix(&mut self) -> (Vec<u8>, usize) { /* ... */ }

    // Called on disconnect: releases the prefix back to available_prefixes
    // and removes the connection from all mappings.
    pub fn remove_peer(&mut self, peer_addr: &str) { /* ... */ }

    // Updates current_bead_commitment from the latest DAG tip hash.
    // Triggered via NotifyCmd::UpdateExtranonce when a new bead is found.
    pub fn update_bead_commitment(&mut self, bead_hash: bitcoin::BlockHash) { /* ... */ }
}

// ─────────────────────────────────────────────
// SERVER
// ─────────────────────────────────────────────

// Top-level listener. Owns the StratumServerConfig and the shared ConnectionMapping.
// run_stratum_service accepts TCP connections in a loop and spawns a task for each.
// During IBD (ibd_or_not flag set by ipc_block_listener) connections are rejected
// with a warning — the node has no usable templates yet.
pub struct Server {
    stratum_config: StratumServerConfig,
    downstream_connection_mapping: Arc<RwLock<ConnectionMapping>>,
    block_submission_tx: Option<mpsc::UnboundedSender<BlockSubmissionRequest>>,
}

impl Server {
    pub fn new(
        server_config: StratumServerConfig,
        connection_mapping_arc: Arc<RwLock<ConnectionMapping>>,
        block_submission_tx: Option<mpsc::UnboundedSender<BlockSubmissionRequest>>,
    ) -> Self { /* ... */ }

    // Main accept loop. For each accepted TCP connection:
    //   1. Check IBD flag — reject if syncing
    //   2. Split TCP stream into OwnedReadHalf / OwnedWriteHalf
    //   3. Create per-miner MiningJobMap, insert into global job_map_arc
    //   4. Create bounded outbound channel (DOWNSTREAM_CHANNEL_CAPACITY = 1024)
    //   5. Register ConnectionInfo in ConnectionMapping
    //   6. Spawn handle_connection task for read side
    //   7. Spawn write task draining the outbound channel to the socket
    pub async fn run_stratum_service(
        &mut self,
        listener: TcpListener,
        mining_job_map: Arc<Mutex<HashMap<String, Arc<Mutex<MiningJobMap>>>>>,
        notification_sender: mpsc::Sender<NotifyCmd>,
        swarm_handler: Arc<Mutex<SwarmHandler>>,
        ibd_or_not: Arc<AtomicBool>,
        audit_dag: Option<Arc<Mutex<AuditDAG>>>,
        upstream_share_tx: Option<mpsc::Sender<UpstreamShare>>,
        upstream_configure_tx: Option<mpsc::Sender<(Value, u64, mpsc::Sender<Value>)>>,
    ) -> Result<(), Box<std::io::Error>> { /* ... */ }
}

// ─────────────────────────────────────────────
// IPC TEMPLATE PIPELINE (lib.rs)
// ─────────────────────────────────────────────

// Entry point for new block templates from Bitcoin Core IPC.
// Called as a long-running task in main.rs.
// Flow:
//   1. Receive Arc<ipc::client::BlockTemplate> from ipc_block_listener
//   2. Deserialize raw block bytes → bitcoin::Block
//   3. Update latest_template_arc and latest_template_merkle_branch_arc
//      (each in its own scope so guards drop before the send below)
//   4. Capture template_ready_at = Instant::now()
//   5. Send NotifyCmd::SendToAll to Notifier via notifier_tx
//
// template_cache (capacity MAX_CACHED_TEMPLATES = 90) retains recent
// Arc<ipc::client::BlockTemplate> for the lazy-fetch Phase 2 path
// (fetch transactions on full-block-found instead of storing them in every job).
pub async fn ipc_template_consumer(
    mut template_rx: mpsc::Receiver<Arc<ipc::client::BlockTemplate>>,
    notifier_tx: mpsc::Sender<NotifyCmd>,
    latest_template_arc: &mut Arc<Mutex<BlockTemplate>>,
    latest_template_merkle_branch_arc: &mut Arc<Mutex<Vec<Vec<u8>>>>,
    template_cache: Arc<tokio::sync::Mutex<HashMap<TemplateId, Arc<ipc::client::BlockTemplate>>>>,
    latest_template_id: Arc<Mutex<TemplateId>>,
) -> Result<(), IPCtemplateError> { /* ... */ }
