let savedTrees = [];

export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ trees: savedTrees });
  } else if (req.method === 'POST') {
    const { tree } = req.body;
    savedTrees.push(tree);
    res.status(200).json({ success: true, id: savedTrees.length - 1 });
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}