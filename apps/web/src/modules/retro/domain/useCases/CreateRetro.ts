
import type { RetroRepository } from "../ports/RetroRepository";
import type { RetroSession }    from "../entities/RetroSession";

interface CreateRetroInput {
  name:         string;
  teamId:       string;
  votesPerUser: number;
  phaseTimes:   Record<string, number>;
  createdBy:    string;
}

export class CreateRetro {
  constructor(private repo: RetroRepository) {}

  async execute(input: CreateRetroInput): Promise<RetroSession> {
    if (!input.name.trim())  throw new Error("Retro name required");
    if (!input.teamId)       throw new Error("Team required");

    return this.repo.saveSession({
      ...input,
      status: "active",
      phase:  "lobby",
      createdAt: new Date().toISOString(),
      stats: { cards: 0, withAction: 0, votes: 0 },
    });
  }
}
