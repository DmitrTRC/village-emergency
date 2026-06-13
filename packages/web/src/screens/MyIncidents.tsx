import { useAuth } from "../auth/AuthProvider";
import { Feed } from "./Feed";
import type { FeedItem } from "../feed/merge";

export function MyIncidents() {
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const filter = (item: FeedItem) => item.pending || (myId !== null && item.authorId === myId);
  return <Feed filter={filter} />;
}
