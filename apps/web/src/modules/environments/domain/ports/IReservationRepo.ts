import type { Reservation, Repository, EnvPolicy } from '../entities/Reservation';

export interface IReservationRepo {
  getAll():                                             Promise<Reservation[]>;
  getRepositories():                                    Promise<Repository[]>;
  getPolicy():                                          Promise<EnvPolicy>;
  upsert(res: Reservation):                             Promise<void>;
  patch(id: string, patch: Partial<Reservation>):      Promise<void>;
  savePolicy(policy: EnvPolicy):                        Promise<void>;
  createRepository(repo: Omit<Repository,'id'>):        Promise<Repository>;
  updateRepository(repo: Repository):                   Promise<void>;
}
