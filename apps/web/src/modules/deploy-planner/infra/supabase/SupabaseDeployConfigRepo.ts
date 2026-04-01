import type { SupabaseClient } from '@supabase/supabase-js';
import type { DeployConfigPort, ReleaseStatusData, RepoGroupData, VersionConfigData } from '../../domain/ports/DeployConfigPort';

export class SupabaseDeployConfigRepo implements DeployConfigPort {
  constructor(private readonly db: SupabaseClient) {}

  // ── Release Statuses ──
  async findAllStatuses(): Promise<ReleaseStatusData[]> {
    const { data, error } = await this.db.from('dp_release_statuses').select('*').order('ord');
    if (error) throw error;
    return data || [];
  }
  async createStatus(input: Omit<ReleaseStatusData, 'id'>): Promise<ReleaseStatusData> {
    const { data, error } = await this.db.from('dp_release_statuses').insert(input).select().single();
    if (error) throw error;
    return data;
  }
  async updateStatus(id: string, patch: Partial<ReleaseStatusData>): Promise<void> {
    const { error } = await this.db.from('dp_release_statuses').update(patch).eq('id', id);
    if (error) throw error;
  }
  async deleteStatus(id: string): Promise<void> {
    const { error } = await this.db.from('dp_release_statuses').delete().eq('id', id);
    if (error) throw error;
  }
  async reorderStatuses(items: { id: string; ord: number }[]): Promise<void> {
    await Promise.all(items.map(s => this.db.from('dp_release_statuses').update({ ord: s.ord }).eq('id', s.id)));
  }

  // ── Version Config ──
  async getVersionConfig(): Promise<VersionConfigData | null> {
    const { data } = await this.db.from('dp_version_config').select('*').limit(1).single();
    return data || null;
  }
  async saveVersionConfig(patch: Partial<VersionConfigData>): Promise<void> {
    const { data: existing } = await this.db.from('dp_version_config').select('id').limit(1).single();
    if (existing?.id) {
      const { error } = await this.db.from('dp_version_config').update(patch).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await this.db.from('dp_version_config').insert(patch);
      if (error) throw error;
    }
  }

  // ── Repo Groups ──
  async findAllRepoGroups(): Promise<RepoGroupData[]> {
    const { data, error } = await this.db.from('dp_repo_groups').select('*').order('name');
    if (error) throw error;
    return data || [];
  }
  async createRepoGroup(name: string): Promise<RepoGroupData> {
    const { data, error } = await this.db.from('dp_repo_groups').insert({ name, repos: [] }).select().single();
    if (error) throw error;
    return data;
  }
  async deleteRepoGroup(id: string): Promise<void> {
    const { error } = await this.db.from('dp_repo_groups').delete().eq('id', id);
    if (error) throw error;
  }
  async updateRepoGroupRepos(id: string, repos: string[]): Promise<void> {
    const { error } = await this.db.from('dp_repo_groups').update({ repos }).eq('id', id);
    if (error) throw error;
  }
  async renameRepoGroup(id: string, name: string): Promise<void> {
    const { error } = await this.db.from('dp_repo_groups').update({ name }).eq('id', id);
    if (error) throw error;
  }

  // ── Jira Deploy Statuses (sso_config) ──
  async getJiraDeployStatuses(): Promise<string> {
    const { data } = await this.db.from('sso_config').select('deploy_jira_statuses').limit(1).single();
    return data?.deploy_jira_statuses || '';
  }
  async saveJiraDeployStatuses(statuses: string): Promise<void> {
    const { data: cfg } = await this.db.from('sso_config').select('id').limit(1).single();
    if (cfg) {
      const { error } = await this.db.from('sso_config').update({ deploy_jira_statuses: statuses }).eq('id', cfg.id);
      if (error) throw error;
    }
  }
}
