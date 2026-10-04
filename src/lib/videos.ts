// Listing video rules, shared by the website, the app and the server.
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v" };
export const VIDEO_MAX = 250 * 1024 * 1024;
export const VIDEO_OPEN_STATUSES = ["draft", "scheduled", "live", "referred", "offers"];
export const VIDEO_STATUS: Record<string, string> = { pending: "Waiting for approval", approved: "Live on the listing", rejected: "Not approved", removed: "Removed" };
// A listing has up to 10 photos and videos in total, and at most one video.
export const MEDIA_MAX = 10;
export const VIDEOS_PER_LOT = 1;
