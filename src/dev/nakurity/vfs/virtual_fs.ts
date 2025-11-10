// Types
export interface File {
  type: "file";
  name: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Directory {
  type: "dir";
  name: string;
  children: (File | Directory)[];
  createdAt: Date;
  updatedAt: Date;
}

export type Node = File | Directory;

export class VirtualFS {
  root: Directory;

  constructor() {
    this.root = {
      type: "dir",
      name: "/",
      children: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // Create a file (with overwrite option)
  createFile(path: string, content: string, overwrite = false) {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error("Invalid path");

    const dir = this.getOrCreateDir(parts);

    const existing = dir.children.find(
      (child) => child.type === "file" && child.name === fileName
    ) as File | undefined;

    if (existing) {
      if (!overwrite) throw new Error("File already exists");
      existing.content = content;
      existing.updatedAt = new Date();
      return;
    }

    dir.children.push({
      type: "file",
      name: fileName,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    dir.updatedAt = new Date();
  }

  // Read a file
  readFile(path: string): string {
    const node = this.findNode(path);
    if (!node || node.type !== "file") throw new Error("File not found");
    return node.content;
  }

  // Delete a file
  unlink(path: string) {
    const parts = path.split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error("Invalid path");

    const dir = this.findNode("/" + parts.join("/"));
    if (!dir || dir.type !== "dir") throw new Error("Directory not found");

    const index = dir.children.findIndex(
      (child) => child.type === "file" && child.name === fileName
    );
    if (index === -1) throw new Error("File not found");

    dir.children.splice(index, 1);
    dir.updatedAt = new Date();
  }

  // Create a directory
  mkdir(path: string) {
    const parts = path.split("/").filter(Boolean);
    this.getOrCreateDir(parts);
  }

  // List directory contents
  readdir(path: string): string[] {
    const node = this.findNode(path);
    if (!node || node.type !== "dir") throw new Error("Directory not found");
    return node.children.map((child) => child.name);
  }

  // Rename/move file or directory
  rename(oldPath: string, newPath: string) {
    const node = this.findNode(oldPath);
    if (!node) throw new Error("Node not found");

    // Remove from old parent
    const oldParts = oldPath.split("/").filter(Boolean);
    const oldName = oldParts.pop();
    const oldParent = this.findNode("/" + oldParts.join("/")) as Directory;
    oldParent.children = oldParent.children.filter((c) => c !== node);

    // Add to new parent
    const newParts = newPath.split("/").filter(Boolean);
    const newName = newParts.pop();
    const newParent = this.getOrCreateDir(newParts);

    node.name = newName!;
    newParent.children.push(node);
    newParent.updatedAt = new Date();
  }

  // --- Stat method ---
  stat(path: string): Stats {
    const node = this.findNode(path);
    if (!node) throw new Error("Path not found");

    if (node.type === "file") {
      return {
        type: "file",
        name: node.name,
        size: node.content.length,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    } else {
      return {
        type: "dir",
        name: node.name,
        size: node.children.length, // number of entries
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        childrenCount: node.children.length,
      };
    }
  }

  exists(path: string): boolean {
    return !!this.findNode(path);
  }

  writeFile(path: string, content: string) {
    const node = this.findNode(path);
    if (!node) throw new Error("File not found");
    if (node.type !== "file") throw new Error("Path is not a file");
    node.content = content;
    node.updatedAt = new Date();
  }

  appendFile(path: string, content: string) {
    const node = this.findNode(path);
    if (!node) throw new Error("File not found");
    if (node.type !== "file") throw new Error("Path is not a file");
    node.content += content;
    node.updatedAt = new Date();
  }

  // --- Saving & Loading ---
  save(): string {
    // Serialize with ISO dates
    return JSON.stringify(this.root, null, 2);
  }

  load(json: string) {
    const reviveDates = (node: any): Node => {
      node.createdAt = new Date(node.createdAt);
      node.updatedAt = new Date(node.updatedAt);
      if (node.type === "dir") {
        node.children = node.children.map(reviveDates);
      }
      return node;
    };
    this.root = reviveDates(JSON.parse(json)) as Directory;
  }

  // --- Async wrappers ---
  async statAsync(path: string): Promise<Stats> {
    return Promise.resolve(this.stat(path));
  }

  async createFileAsync(path: string, content: string, overwrite = false): Promise<void> {
    return Promise.resolve(this.createFile(path, content, overwrite));
  }

  async readFileAsync(path: string): Promise<string> {
    return Promise.resolve(this.readFile(path));
  }

  async unlinkAsync(path: string): Promise<void> {
    return Promise.resolve(this.unlink(path));
  }

  async mkdirAsync(path: string): Promise<void> {
    return Promise.resolve(this.mkdir(path));
  }

  async readdirAsync(path: string): Promise<string[]> {
    return Promise.resolve(this.readdir(path));
  }

  async renameAsync(oldPath: string, newPath: string): Promise<void> {
    return Promise.resolve(this.rename(oldPath, newPath));
  }

  // --- Helpers ---
  private getOrCreateDir(parts: string[]): Directory {
    let current = this.root;
    for (const part of parts) {
      let next = current.children.find(
        (child) => child.type === "dir" && child.name === part
      ) as Directory | undefined;

      if (!next) {
        next = {
          type: "dir",
          name: part,
          children: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        current.children.push(next);
      }
      current = next;
    }
    return current;
  }

  private findNode(path: string): Node | undefined {
    if (path === "/") return this.root;
    const parts = path.split("/").filter(Boolean);
    let current: Node = this.root;

    for (const part of parts) {
      if (current.type !== "dir") return undefined;
      const next = current.children.find((child) => child.name === part);
      if (!next) return undefined;
      current = next;
    }
    return current;
  }
}

// --- Example usage ---
export const vfs = new VirtualFS();
vfs.mkdir("/docs");
vfs.createFile("/docs/readme.txt", "Hello Virtual FS!");
console.log(vfs.readFile("/docs/readme.txt")); // Hello Virtual FS!
console.log(vfs.readdir("/docs")); // [ 'readme.txt' ]
vfs.rename("/docs/readme.txt", "/docs/guide.txt");
console.log(vfs.readdir("/docs")); // [ 'guide.txt' ]
vfs.unlink("/docs/guide.txt");
console.log(vfs.readdir("/docs")); // []
