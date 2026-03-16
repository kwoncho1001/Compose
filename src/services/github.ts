export const fetchGithubFileContent = async (
  repoUrl: string,
  path: string,
  token?: string
): Promise<string> => {
  if (!repoUrl) return '';

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error("Invalid GitHub repository URL. Expected format: https://github.com/owner/repo");
  }

  const [, owner, repo] = match;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API Error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.encoding === 'base64') {
      const binString = atob(data.content);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    }
    return data.content || '';
  } catch (error) {
    console.error("Failed to fetch GitHub file content:", error);
    throw error;
  }
};

export const fetchGithubFiles = async (
  repoUrl: string,
  token?: string
): Promise<string[]> => {
  if (!repoUrl) return [];

  // Parse repoUrl: https://github.com/owner/repo
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error("Invalid GitHub repository URL. Expected format: https://github.com/owner/repo");
  }

  const [, owner, repo] = match;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        // Try master branch if main fails
        const masterUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`;
        const masterResponse = await fetch(masterUrl, { headers });
        if (masterResponse.ok) {
          const data = await masterResponse.json();
          return data.tree.map((item: any) => item.path);
        }
      }
      throw new Error(`GitHub API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tree.map((item: any) => item.path);
  } catch (error) {
    console.error("Failed to fetch GitHub files:", error);
    throw error;
  }
};

export const searchGithubRepos = async (
  query: string,
  token?: string
): Promise<{ full_name: string; html_url: string; description: string }[]> => {
  const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=5`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(`GitHub Search Error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.items.map((item: any) => ({
      full_name: item.full_name,
      html_url: item.html_url,
      description: item.description,
    }));
  } catch (error) {
    console.error("Failed to search GitHub repos:", error);
    throw error;
  }
};
