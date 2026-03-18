export const fetchGithubFileContent = async (
  repoUrl: string,
  path: string,
  token?: string
): Promise<string> => {
  if (!repoUrl) return '';

  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) {
    throw new Error("Invalid Github repository URL. Expected format: https://github.com/owner/repo");
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
      throw new Error(`Github API Error: ${response.statusText}`);
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
    console.error("Failed to fetch Github file content:", error);
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
    throw new Error("Invalid Github repository URL. Expected format: https://github.com/owner/repo");
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
      throw new Error(`Github API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tree.map((item: any) => item.path);
  } catch (error) {
    console.error("Failed to fetch Github files:", error);
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
      throw new Error(`Github Search Error: ${response.statusText}`);
    }
    const data = await response.json();
    return data.items.map((item: any) => ({
      full_name: item.full_name,
      html_url: item.html_url,
      description: item.description,
    }));
  } catch (error) {
    console.error("Failed to search Github repos:", error);
    throw error;
  }
};

export const fetchGithubRepoDetails = async (
  full_name: string,
  token?: string
): Promise<{ full_name: string; html_url: string; description: string } | null> => {
  const apiUrl = `https://api.github.com/repos/${full_name}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) return null;
    const item = await response.json();
    return {
      full_name: item.full_name,
      html_url: item.html_url,
      description: item.description,
    };
  } catch (error) {
    console.error(`Failed to fetch repo details for ${full_name}:`, error);
    return null;
  }
};

export const fetchLatestCommitSha = async (
  repoUrl: string,
  token?: string
): Promise<string> => {
  if (!repoUrl) return '';
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid Github repository URL.");
  const [, owner, repo] = match;

  // Try main branch first
  let apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/main`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  try {
    let response = await fetch(apiUrl, { headers });
    if (!response.ok && response.status === 404) {
      // Try master branch
      apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/master`;
      response = await fetch(apiUrl, { headers });
    }

    if (!response.ok) {
      throw new Error(`Github API Error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.sha;
  } catch (error) {
    console.error("Failed to fetch latest commit SHA:", error);
    throw error;
  }
};

export const fetchChangedFilesSince = async (
  repoUrl: string,
  baseSha: string,
  token?: string
): Promise<{ path: string; status: string }[]> => {
  if (!repoUrl || !baseSha) return [];
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid Github repository URL.");
  const [, owner, repo] = match;

  const headSha = await fetchLatestCommitSha(repoUrl, token);
  if (headSha === baseSha) return [];

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  try {
    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(`Github API Error: ${response.statusText}`);
    }

    const data = await response.json();
    // status can be 'added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged'
    if (!data.files) return [];
    return data.files.map((f: any) => ({ path: f.filename, status: f.status }));
  } catch (error) {
    console.error("Failed to fetch changed files:", error);
    throw error;
  }
};
