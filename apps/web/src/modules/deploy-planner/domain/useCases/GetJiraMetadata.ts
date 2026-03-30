import type { JiraMetadataPort, JiraIssueType, JiraField } from '../ports/JiraMetadataPort';

export class GetJiraMetadata {
  constructor(private readonly port: JiraMetadataPort) {}

  async execute(): Promise<{ issueTypes: JiraIssueType[]; fields: JiraField[] }> {
    const [issueTypes, allFields] = await Promise.all([
      this.port.getIssueTypes(),
      this.port.getFields(),
    ]);
    // Filter to fields likely used for repo/components grouping
    const fields = allFields.filter(f =>
      f.type === 'array' ||
      f.name.toLowerCase().includes('component') ||
      f.name.toLowerCase().includes('repositor')
    );
    return { issueTypes, fields };
  }
}
