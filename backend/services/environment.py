"""Windows Sandbox and environment detection."""
import os
import platform


def detect_environment() -> str:
    """
    Detect the runtime environment.
    Returns: 'sandbox' | 'production' | 'development'
    """
    # 1. Explicit override via env var
    override = os.environ.get("ENVIRONMENT_MODE")
    if override in ("sandbox", "production", "development"):
        return override

    # 2. Non-Windows defaults to production
    if platform.system() != "Windows":
        return "production"

    # 3. Windows Sandbox signals (check multiple for robustness)
    sandbox_signals = 0

    # Signal A: WDAGUtilityAccount user
    if os.path.exists(r"C:\Users\WDAGUtilityAccount"):
        sandbox_signals += 2

    # Signal B: Registry key
    try:
        import winreg  # type: ignore[import]
        winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Sandbox",
        )
        sandbox_signals += 2
    except (FileNotFoundError, OSError, ImportError):
        pass

    # Signal C: Very low RAM (< 6 GB typical for sandbox)
    import psutil
    if psutil.virtual_memory().total < 6 * 1024 ** 3:
        sandbox_signals += 1

    # Signal D: No persistent storage indicators
    if not os.path.exists(r"C:\ProgramData"):
        sandbox_signals += 1

    return "sandbox" if sandbox_signals >= 2 else "production"
