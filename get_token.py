#!/usr/bin/env python3
"""
Porsche Token Helper — run ONCE to get your refresh token for Shelly.

Usage:
    pip install pyporscheconnectapi
    python get_token.py

After running, copy the output into shelly_direct.js.
You will NOT need to run this again unless you change your Porsche password
(Shelly will auto-renew the token indefinitely).
"""

import asyncio
import getpass
import json
import sys

try:
    import httpx
    from pyporscheconnectapi.connection import Connection
    from pyporscheconnectapi.account import PorscheConnectAccount
    from pyporscheconnectapi.exceptions import (
        PorscheCaptchaRequiredError,
        PorscheWrongCredentialsError,
    )
except ImportError:
    print("Missing dependencies. Run: pip install pyporscheconnectapi")
    sys.exit(1)


async def main():
    print("=" * 55)
    print("  Porsche Token Helper")
    print("  Run once — Shelly will renew the token forever.")
    print("=" * 55)
    print()

    email    = input("My Porsche Email:    ").strip()
    password = getpass.getpass("My Porsche Password: ")

    print("\nConnecting to Porsche... (may take 5-15 seconds)")

    try:
        async with httpx.AsyncClient() as client:
            connection = Connection(email=email, password=password, async_client=client)
            account    = PorscheConnectAccount(connection=connection)
            vehicles   = await account.get_vehicles()
            token      = dict(connection.token)

    except PorscheWrongCredentialsError:
        print("\n❌ Wrong email or password.")
        sys.exit(1)

    except PorscheCaptchaRequiredError as e:
        print("\n⚠️  Porsche requires a captcha.")
        print("   Please log in via the My Porsche app or website first,")
        print("   then try again.")
        sys.exit(1)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

    refresh_token = token.get("refresh_token", "")
    if not refresh_token:
        print("❌ No refresh token received. Try again.")
        sys.exit(1)

    print("\n" + "=" * 55)
    print("  ✓ Success! Copy these values into shelly_direct.js:")
    print("=" * 55 + "\n")

    print(f'var REFRESH_TOKEN = "{refresh_token}";\n')

    for v in vehicles:
        vin   = v.vin
        name  = v.model_name
        year  = v.model_year
        print(f'// {name} {year}')
        print(f'var VIN = "{vin}";\n')

    print("=" * 55)
    print("  ⚠️  Keep these values private!")
    print("  The refresh token gives full access to your vehicle.")
    print("=" * 55)
    print()
    print("Full token (for reference):")
    safe = {k: v for k, v in token.items() if k != "refresh_token"}
    safe["refresh_token"] = refresh_token[:20] + "... (shown above)"
    print(json.dumps(safe, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
