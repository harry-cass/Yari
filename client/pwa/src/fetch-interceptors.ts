import { MDNOfflineDB } from "./db";

const PATH_COLLECTIONS = "/api/v1/plus/collection";
const PATH_WHOAMI = "/api/v1/whoami";
const PATH_WATCHING = "/api/v1/plus/watching";
const PATH_NOTIFICATIONS = "/api/v1/plus/notifications";

interface FetchInterceptor {
  db: MDNOfflineDB;
  handles(url: string): boolean;
  onGet(req: Request): Promise<Response>;
  onPost(req: Request): Promise<Response>;
}

function jsonBlob(json) {
  return new Blob([JSON.stringify(json, null, 2)], {
    type: "application/json",
  });
}

class WhoamiInterceptor implements FetchInterceptor {
  db: MDNOfflineDB;

  constructor(db: MDNOfflineDB) {
    this.db = db;
  }

  handles(path: string): boolean {
    return path.startsWith(PATH_WHOAMI);
  }

  async onGet(req: Request): Promise<Response> {
    try {
      const res = await fetch(req);
      const json = await res.clone().json();
      if (json?.username) {
        await this.db.whoami.put(json, 1);
      }
      return res;
    } catch (err: any) {
      const whoami = await this.db.whoami.get(1);
      return new Response(jsonBlob({ ...whoami, offline: true }));
    }
  }
  async onPost(req: Request): Promise<Response> {
    return await fetch(req);
  }
}

class CollectionsInterceptor implements FetchInterceptor {
  db: MDNOfflineDB;

  constructor(db: MDNOfflineDB) {
    this.db = db;
  }

  handles(path: string): boolean {
    return path.startsWith(PATH_COLLECTIONS);
  }

  async onGet(req: Request): Promise<Response> {
    try {
      const res = await fetch(req);
      const json = await res.clone().json();
      if (json?.items) {
        this.db.collections.bulkPut(json.items);
      } else if (json?.bookmarked) {
        this.db.collections.put(json.bookmarked);
      }
      return res;
    } catch (err) {
      const url = new URL(req.url).searchParams.get("url");
      if (url) {
        //Single request case.
        const item = await this.db.collections.get({ url: url });
        return new Response(jsonBlob({ bookmarked: item, offline: true }));
      } else {
        const collection = await this.db.collections.toCollection().toArray();
        return new Response(
          jsonBlob({
            items: collection,
            metadata: { total: collection.length, per_page: collection.length },
          })
        );
      }
    }
  }
  async onPost(req: Request): Promise<Response> {
    try {
      const res = await fetch(req);
      return res;
    } catch (err) {
      return new Response(jsonBlob({ error: "offline" }));
    }
  }
}

class NotificationsInterceptor implements FetchInterceptor {
  db: MDNOfflineDB;

  constructor(db: MDNOfflineDB) {
    this.db = db;
  }

  handles(path: string): boolean {
    return path.startsWith(PATH_NOTIFICATIONS);
  }

  async onGet(req: Request): Promise<Response> {
    try {
      const res = await fetch(req);
      const json = await res.clone().json();
      if (json?.items) {
        await this.db.notifications.bulkPut(json?.items);
      }
      return res;
    } catch (err: any) {
      let notifications = await this.db.notifications.toCollection().toArray();
      const params = new URL(req.url).searchParams;

      if (Boolean(params.get("starred"))) {
        notifications = notifications.filter((v) => v.starred);
      }
      const limit = params.get("limit");
      const offset = params.get("offset");
      if (limit && offset) {
        notifications = notifications.slice(parseInt(offset), parseInt(limit));
      }
      return new Response(jsonBlob({ items: notifications, offline: true }));
    }
  }
  async onPost(req: Request): Promise<Response> {
    try {
      return await fetch(req);
    } catch (err) {
      return new Response(jsonBlob({ error: "offline" }));
    }
  }
}

class WatchedInterceptor implements FetchInterceptor {
  db: MDNOfflineDB;

  constructor(db: MDNOfflineDB) {
    this.db = db;
  }

  handles(path: string): boolean {
    return path.startsWith(PATH_WATCHING);
  }

  async onGet(req: Request): Promise<Response> {
    try {
      const res = await fetch(req);
      const json = await res.clone().json();
      if (json?.items) {
        await this.db.watched.bulkPut(json.items);
      } else if (json?.status !== "unwatched") {
        await this.db.watched.put(json);
      }
      return res;
    } catch (err: any) {
      let watching;
      try {
        const params = new URL(req.url).searchParams;
        const url = params.get("url");
        if (url) {
          const watched = await this.db.watched.get({ url: url.toLowerCase() });

          return new Response(
            jsonBlob({ ...watched, status: "major", offline: true })
          );
        } else {
          watching = await this.db.watched.toCollection().toArray();
          const limit = params.get("limit");
          const offset = params.get("offset");
          if (limit && offset) {
            watching = watching.slice(parseInt(offset), parseInt(limit));
          }
          // We don't store the status.
          watching = watching.map((val) => {
            return { ...val, status: "major" };
          });
        }
      } catch (err) {
        console.error(err);
        watching = [];
      }
      return new Response(jsonBlob({ items: watching, offline: true }));
    }
  }
  async onPost(req: Request): Promise<Response> {
    try {
      const res = await fetch(req);
      return res;
    } catch (err) {
      return new Response(jsonBlob({ error: "offline" }));
    }
  }
}

export {
  WhoamiInterceptor,
  CollectionsInterceptor,
  WatchedInterceptor,
  NotificationsInterceptor,
};
