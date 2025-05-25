const GIST_ID = process.env.GIST_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_API = `https://api.github.com/gists/${GIST_ID}`;

// Fetch current data and file SHA from Gist
async function loadData() {
  const gistRes = await fetch(GIST_API, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  if (!gistRes.ok) throw new Error(`Failed to fetch gist: ${gistRes.status}`);
  const gistJson = await gistRes.json();
  const file = gistJson.files["plantxwallet.json"];
  if (!file || !file.raw_url) throw new Error("plantxwallet.json not found");

  const rawRes = await fetch(file.raw_url);
  if (!rawRes.ok) throw new Error(`Failed to fetch raw: ${rawRes.status}`);
  const json = await rawRes.json();

  // Expect an array: [{ questionId: X, optionId: Y }, ...]
  const dataArray = Array.isArray(json) ? json : [];

  return { data: dataArray, sha: file.sha };
}

// Update Gist with new data array
async function saveData(newArray, sha) {
  const payload = {
    description: "Update plantxwallet.json",
    files: {
      "plantxwallet.json": {
        content: JSON.stringify(newArray, null, 2),
        sha,
      },
    },
  };
  const res = await fetch(GIST_API, {
    method: "PATCH",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update gist: ${res.status}`);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const { data } = await loadData();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      const items = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res
          .status(400)
          .json({ error: "Request body must be a non-empty array" });
      }

      // Load existing data and sha
      const { data: existing, sha } = await loadData();

      const added = [];
      const skipped = [];
      for (const item of items) {
        const { questionId, optionId } = item;
        const isDup = existing.some(
          x => x.questionId === questionId
        );
        if (isDup) skipped.push(item);
        else added.push({ questionId, optionId });
      }

      if (added.length === 0) {
        return res.status(200).json({ message: "No new items", skipped });
      }

      const newData = existing.concat(added);
      await saveData(newData, sha);

      return res
        .status(201)
        .json({ message: "New items added and pushed", added, skipped });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return res.status(405).json({ error: "Method not supported" });
}
