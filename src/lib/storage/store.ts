import fs from 'fs/promises';
import path from 'path';
import { Repository, TaskRun } from '@/types';
import { getConfig } from '../config';

interface StoreData {
  repositories: Repository[];
  tasks: TaskRun[];
  lastUpdated: string;
}

export class AppStore {
  private static async getStoreFilePath(): Promise<string> {
    const config = getConfig();
    await fs.mkdir(config.storageDir, { recursive: true });
    return path.join(config.storageDir, 'store.json');
  }

  private static async readData(): Promise<StoreData> {
    try {
      const filePath = await this.getStoreFilePath();
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch {
      // Default initial state with the current DevForge project registered
      const defaultData: StoreData = {
        repositories: [
          {
            id: 'devforge-local',
            name: 'devforge-ai (Local Workspace)',
            localPath: process.cwd(),
            remoteUrl: 'https://github.com/ysirishchandra-lgtm/devforge-ai.git',
            branch: 'main',
            isClean: true,
            totalFiles: 15,
            detectedStack: ['TypeScript', 'Next.js', 'React', 'Node.js'],
            lastScannedAt: new Date().toISOString(),
            isCloned: true,
          },
        ],
        tasks: [],
        lastUpdated: new Date().toISOString(),
      };
      await this.writeData(defaultData);
      return defaultData;
    }
  }

  private static async writeData(data: StoreData): Promise<void> {
    const filePath = await this.getStoreFilePath();
    data.lastUpdated = new Date().toISOString();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // Repository methods
  static async getRepositories(): Promise<Repository[]> {
    const data = await this.readData();
    return data.repositories;
  }

  static async getRepositoryById(id: string): Promise<Repository | undefined> {
    const data = await this.readData();
    return data.repositories.find((r) => r.id === id);
  }

  static async saveRepository(repo: Repository): Promise<Repository> {
    const data = await this.readData();
    const index = data.repositories.findIndex((r) => r.id === repo.id);
    if (index >= 0) {
      data.repositories[index] = repo;
    } else {
      data.repositories.unshift(repo);
    }
    await this.writeData(data);
    return repo;
  }

  // Task methods
  static async getTasks(): Promise<TaskRun[]> {
    const data = await this.readData();
    return data.tasks;
  }

  static async getTaskById(id: string): Promise<TaskRun | undefined> {
    const data = await this.readData();
    return data.tasks.find((t) => t.id === id);
  }

  static async saveTask(task: TaskRun): Promise<TaskRun> {
    const data = await this.readData();
    const index = data.tasks.findIndex((t) => t.id === task.id);
    task.updatedAt = new Date().toISOString();
    if (index >= 0) {
      data.tasks[index] = task;
    } else {
      data.tasks.unshift(task);
    }
    await this.writeData(data);
    return task;
  }
}
