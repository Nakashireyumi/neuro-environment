# cvm.py
import json
import os
import subprocess
import threading
import uuid
from typing import Any, Dict, List, Optional

DELIM = "\n\n"

class CVMConfig:
    """
    Configuration for Cassitly VM TypeScript integration.
    """
    def __init__(
        self,
        node_path: str = "node",
        bridge_js: str = "dist/bridge.js",
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        startup_timeout_sec: float = 5.0,
    ):
        self.node_path = node_path
        self.bridge_js = bridge_js
        self.cwd = cwd
        self.env = env or os.environ.copy()
        self.startup_timeout_sec = startup_timeout_sec


class CVM:
    """
    Cassitly VM (cvm) is a binary loader that allows cross operation
    between different languages and Python. For TypeScript, it uses a Node bridge.
    """

    def __init__(self, config: CVMConfig):
        self.config = config
        self.proc = subprocess.Popen(
            [self.config.node_path, self.config.bridge_js],
            cwd=self.config.cwd,
            env=self.config.env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self._lock = threading.Lock()
        self._responses: Dict[str, Dict[str, Any]] = {}
        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

    def close(self):
        try:
            if self.proc and self.proc.poll() is None:
                self.proc.stdin.close()
                self.proc.terminate()
        except Exception:
            pass

    def _reader_loop(self):
        buf = ""
        while True:
            if self.proc.stdout is None:
                break
            chunk = self.proc.stdout.read(1)
            if not chunk:
                break
            buf += chunk
            while True:
                idx = buf.find(DELIM)
                if idx == -1:
                    break
                raw = buf[:idx]
                buf = buf[idx + len(DELIM):]
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                msg_id = str(msg.get("id"))
                with self._lock:
                    self._responses[msg_id] = msg

    def _call(self, method: str, params: List[Any]) -> Any:
        if self.proc.stdin is None:
            raise RuntimeError("Bridge stdin not available")
        msg_id = str(uuid.uuid4())
        payload = {"id": msg_id, "method": method, "params": params}
        self.proc.stdin.write(json.dumps(payload) + DELIM)
        self.proc.stdin.flush()

        # Wait for response
        while True:
            with self._lock:
                if msg_id in self._responses:
                    msg = self._responses.pop(msg_id)
                    break
        if "error" in msg and msg["error"]:
            raise RuntimeError(msg["error"].get("message", "Unknown error"))
        return msg.get("result")

    # Mirror VirtualFS sync API
    def createFile(self, path: str, content: str, overwrite: bool = False) -> None:
        self._call("createFile", [path, content, overwrite])

    def readFile(self, path: str) -> str:
        return self._call("readFile", [path])

    def unlink(self, path: str) -> None:
        self._call("unlink", [path])

    def mkdir(self, path: str) -> None:
        self._call("mkdir", [path])

    def readdir(self, path: str) -> List[str]:
        return self._call("readdir", [path])

    def rename(self, oldPath: str, newPath: str) -> None:
        self._call("rename", [oldPath, newPath])

    def stat(self, path: str) -> Dict[str, Any]:
        return self._call("stat", [path])

    def exists(self, path: str) -> bool:
        return self._call("exists", [path])

    def writeFile(self, path: str, content: str) -> None:
        self._call("writeFile", [path, content])

    def appendFile(self, path: str, content: str) -> None:
        self._call("appendFile", [path, content])

    def save(self) -> str:
        return self._call("save", [])

    def load(self, json_str: str) -> None:
        self._call("load", [json_str])

    # Async API (still synchronous on Python side but calls TS async methods)
    def statAsync(self, path: str) -> Dict[str, Any]:
        return self._call("statAsync", [path])

    def createFileAsync(self, path: str, content: str, overwrite: bool = False) -> None:
        self._call("createFileAsync", [path, content, overwrite])

    def readFileAsync(self, path: str) -> str:
        return self._call("readFileAsync", [path])

    def unlinkAsync(self, path: str) -> None:
        self._call("unlinkAsync", [path])

    def mkdirAsync(self, path: str) -> None:
        self._call("mkdirAsync", [path])

    def readdirAsync(self, path: str) -> List[str]:
        return self._call("readdirAsync", [path])

    def renameAsync(self, oldPath: str, newPath: str) -> None:
        self._call("renameAsync", [oldPath, newPath])
