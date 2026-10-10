export type FeatureVoteItem = {
  id: string;
  audience: "customer" | "professional" | "all";
  title: string;
  description: string;
  status: string;
  vote_count: number;
  dislike_count: number;
  total_count: number;
  my_vote: boolean;
  my_choice: "like" | "dislike" | null;
  closes_at: string;
  voting_open: boolean;
};

export function voteDeadline(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London",
  }).format(new Date(value));
}
