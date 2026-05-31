import os
import yaml


class AgentX:
    def __init__(self, config_path):
        # Load configuration
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)

        self.workspace = config["paths"]["workspace"]

    # ---------------------------------------------------------
    # FILE OPERATIONS
    # ---------------------------------------------------------
    def read_file(self, filename):
        path = os.path.join(self.workspace, filename)
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def write_file(self, filename, content):
        path = os.path.join(self.workspace, filename)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ Wrote {filename}")

    def append_file(self, filename, content):
        path = os.path.join(self.workspace, filename)
        with open(path, "a", encoding="utf-8") as f:
            f.write(content)
        print(f"➕ Appended to {filename}")

    def list_files(self, subpath=""):
        path = os.path.join(self.workspace, subpath)
        return os.listdir(path)

    def file_exists(self, filename):
        path = os.path.join(self.workspace, filename)
        return os.path.exists(path)


# ---------------------------------------------------------
# MAIN EXECUTION
# ---------------------------------------------------------
if __name__ == "__main__":
    agent = AgentX(
        config_path="C:/projects/kensgames/kensgames/config.yaml"
    )

    print("AgentX initialized (local‑only mode).")
