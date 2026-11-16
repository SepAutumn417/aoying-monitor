import { TimelinePage } from "../timeline/TimelinePage";

/** One original-message view keeps edits, deletions and identity/topic filters consistent. */
export function WorkspacePage() {
  return <TimelinePage />;
}
