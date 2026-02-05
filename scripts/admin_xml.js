/**
 * GitHub Sync Logic for BitMundo Admin
 * Handles fetching XML files and pushing updates.
 */

const REPO_OWNER = 'MiguelQueiroz010';
const REPO_NAME = 'bitmundonet';

export async function fetchFileFromGithub(path, token) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
    const response = await fetch(url, {
        headers: { 'Authorization': `token ${token}` }
    });

    if (!response.ok) throw new Error(`GitHub Fetch Error: ${response.statusText}`);

    const data = await response.json();
    const content = atob(data.content.replace(/\n/g, ''));
    return { content, sha: data.sha };
}

export async function pushFileToGithub(path, content, sha, token, message) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
    const body = {
        message: message || `Admin Update: ${path}`,
        content: btoa(unescape(encodeURIComponent(content))),
        sha: sha
    };

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`GitHub Push Error: ${error.message}`);
    }

    return await response.json();
}

/**
 * Basic XML Parser for simple editing
 */
export function parseProjectsXML(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    return Array.from(xmlDoc.getElementsByTagName("project")).map(p => ({
        id: p.getAttribute("id"),
        title: p.getElementsByTagName("title")[0]?.textContent || "",
        subtitle: p.getElementsByTagName("subtitle")[0]?.textContent || "",
        status: p.getElementsByTagName("status")[0]?.textContent || "WIP"
    }));
}
