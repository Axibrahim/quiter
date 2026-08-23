import os

from dotenv import load_dotenv
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=_env_path)

from app import create_app

app = create_app(config_name=os.environ.get("QUITER_ENV", "production"))

if __name__ == "__main__":
    # debug=True must NEVER be used in production — Flask's debugger
    # exposes an interactive Python console over HTTP on any unhandled
    # exception, which is a direct remote-code-execution vector.
    app.run(host="127.0.0.1", port=5000, debug=(os.environ.get("QUITER_ENV") == "development"))
