declare global {
  namespace App {
    interface Locals {
      activeProjectId?: string;
      user?: { id: string; email: string };
    }
  }
}

export {};
