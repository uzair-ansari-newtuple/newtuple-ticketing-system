export type CaptureProfile = "PHOTO_LANE";
export type JobStatus = "pending" | "running" | "completed" | "failed";
export type PhotoSlot = "front" | "back" | "tag" | "label" | "other";

export type UserRole = "store" | "resolver";

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: { id: string; username: string; role: UserRole; store_id: string | null; store_name: string };
}

export interface QualityHint {
  blur_score: number;
  brightness: number;
  width: number;
  height: number;
}

export interface ImagePayload {
  client_image_id: string;
  slot: PhotoSlot;
  capture: CaptureMetadata;
  mime_type: "image/jpeg" | "image/png";
  image_base64: string;
  sha256: string;
  quality_hint: QualityHint;
}

export interface IncidentCreateBody {
  quality_check_id: string;
  images: ImagePayload[];
  client_analysis: ClientAnalysis;
  embeddings: number[][];
  thumb: string;
}

export interface QualityImageResult {
  client_image_id: string;
  sha256: string;
  passed: boolean;
  failed_description: string | null;
}

export interface QualityCheckResult {
  quality_check_id: string;
  can_create_incident: boolean;
  failed_description: string | null;
  images: QualityImageResult[];
  checked_at: string;
  expires_at: string;
}

export interface Job<T = unknown> {
  id: string;
  job_type: "quality_check" | "metadata_extraction";
  status: JobStatus;
  progress: number;
  result: T | null;
  error_message: string | null;
}

export interface NormalizedMetadata {
  Brand: string | null;
  ColorCode: string | null;
  ColorName: string | null;
  SizeCode: string | null;
  SizeName: string | null;
  DepartmentCode: string | null;
  DepartmentName: string | null;
  ClassCode: string | null;
  ClassName: string | null;
  Barcode: string | null;
  ProductName: string | null;
  Sku: string | null;
  Price: string | null;
}

export type FieldSource = "image_match" | "classifier" | "ocr" | "barcode";

export interface LabelScore {
  code: string;
  name: string;
  score: number;
}

export interface ReferenceItem {
  id: string;
  metadata: NormalizedMetadata;
  thumb: string;
  embeddings: number[][];
  createdAt: string;
  catalog?: boolean;
}

export interface LibraryEntry {
  id: string;
  metadata: NormalizedMetadata;
  thumb: string;
  photos: number;
  created_at: string;
}

export interface MatchCandidate {
  reference_id: string;
  similarity: number;
  metadata: NormalizedMetadata;
  thumb: string;
}

export interface ClientAnalysis {
  model: string;
  match: MatchCandidate | null;
  top_matches: MatchCandidate[];
  match_threshold: number;
  classification: {
    class: LabelScore & { departmentCode: string; departmentName: string };
    color: LabelScore;
  } | null;
  ocr: {
    text: string;
    brand: string | null;
    size: { code: string; name: string } | null;
    price: string | null;
    barcode: string | null;
    confidence: number;
  } | null;
  error: string | null;
}

export interface MetadataExtraction {
  extraction_id: string;
  incident_id: string;
  lane: CaptureProfile;
  status: JobStatus;
  model_name: string;
  prompt_version: string;
  normalized_metadata: NormalizedMetadata | null;
  ocr_text: string | null;
  confidence: number | null;
  warnings: string[];
  missing_fields: string[];
  field_sources: Partial<Record<keyof NormalizedMetadata, { source: FieldSource; confidence: number }>>;
  error_message: string | null;
  updated_at: string;
}

export type IncidentState =
  | "METADATA_PENDING"
  | "CANDIDATES_READY"
  | "ESCALATED"
  | "RESOLUTION_IN_PROGRESS"
  | "RESOLVER_RESPONSE_RECEIVED"
  | "CONFIRMED"
  | "PRINTED"
  | "COMPLETED"
  | "CLOSED"
  | "FAILED";

export type Gating = "GREEN" | "YELLOW" | "RED";
export type Lane = "PHOTO_LANE" | "FAST_LANE";
export type EscalationReason = "BARCODE_NOT_FOUND" | "TOO_MANY_CANDIDATES" | "LOW_EVIDENCE" | "CATALOG_UNAVAILABLE" | "USER_UNSURE" | "PRINT_FAILURE" | "OTHER";
export type ItemAge = "NEW_FREIGHT" | "OLD_MERCHANDISE";
export type ResolverDecision = "RECOMMEND" | "CANT_RESOLVE" | "NOT_APPAREL";
export type Disposition = "DISCARD" | "RETURN_TO_VENDOR" | "DONATE";
export type Priority = "HIGH" | "LOW";

export interface Candidate {
  key: string;
  sku: string | null;
  metadata: NormalizedMetadata;
  score: number;
  evidence: "barcode" | "image" | "attributes";
  thumb: string | null;
}

export interface Escalation {
  reason: EscalationReason;
  note: string;
  item_age: ItemAge;
  created_at: string;
}

export interface ResolverState {
  status: "NEW" | "IN_PROGRESS" | "RESOLVED";
  claimed_by: string | null;
  decision: ResolverDecision | null;
  recommended: NormalizedMetadata | null;
  comment: string | null;
  responded_at: string | null;
}

export interface PrintJob {
  id: string;
  printer: number;
  copies: number;
  status: "accepted" | "failed";
  message: string | null;
  upc: string;
  created_at: string;
}

export interface IncidentEvent {
  type: string;
  actor: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface IncidentSummary {
  id: string;
  lane: Lane;
  number_display: string;
  state: IncidentState;
  gating: Gating | null;
  thumb: string | null;
  summary: string;
  unread: boolean;
  resolver_status: ResolverState["status"] | null;
  resolver_decision: ResolverDecision | null;
  priority: Priority | null;
  title: string;
  department: string | null;
  short_number: number;
  disposition: Disposition | null;
  new_tag_added: boolean;
  store_id: string;
  created_at: string;
  updated_at: string;
}

export interface IncidentDetail extends IncidentSummary {
  gating_reason: string | null;
  candidates: Candidate[];
  selected: Candidate | null;
  item_age: ItemAge | null;
  escalation: Escalation | null;
  resolver: ResolverState | null;
  extraction: MetadataExtraction | null;
  analysis: ClientAnalysis;
  embeddings: number[][] | null;
  events: IncidentEvent[];
  prints: PrintJob[];
  image_count: number;
}

export interface StoredImage {
  slot: PhotoSlot;
  data_url: string;
  capture: CaptureMetadata;
}

export interface Incident {
  incident_id: string;
  incident_number_display: string;
  store_id: string;
  current_state: IncidentState;
  capture_profile_id: CaptureProfile;
  created_at: string;
  metadata_job_id: string;
  image_count: number;
}

export interface CaptureMetadata {
  fileName: string;
  source: "captured" | "uploaded";
  mimeType: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  sha256: string;
  capturedAt: string | null;
  device: string | null;
  orientation: number | null;
  gps: { lat: number; lng: number } | null;
  userAgent: string;
  blurScore: number;
  brightness: number;
}

export interface CatalogProduct extends NormalizedMetadata {
  image_url: string;
  searchable: boolean;
}

export interface NewProductBody {
  name: string;
  brand: string;
  upc: string;
  class_code: string;
  color_code: string;
  price: number;
  images: { mime_type: "image/jpeg"; image_base64: string }[];
  embeddings: number[][];
}
