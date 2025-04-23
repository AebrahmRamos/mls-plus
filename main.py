from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import sys
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, Final, Iterable, List, Optional

import latest_user_agents
import zendriver
from selenium_authenticated_proxy import SeleniumAuthenticatedProxy
from zendriver.cdp.network import T_JSON_DICT, Cookie
from zendriver.core.element import Element

# Configure logging
logging.basicConfig(
    format="[%(levelname)s] %(message)s",
    level=logging.INFO,
    stream=sys.stderr  # Send logs to stderr so stdout can be parsed by Node.js
)

def get_chrome_user_agent() -> str:
    """
    Get a random up-to-date Chrome user agent string.
    """
    chrome_user_agents = [
        user_agent
        for user_agent in latest_user_agents.get_latest_user_agents()
        if "Chrome" in user_agent
    ]

    return random.choice(chrome_user_agents)

class ChallengePlatform(Enum):
    """Cloudflare challenge platform types."""
    JAVASCRIPT = "non-interactive"
    MANAGED = "managed"
    INTERACTIVE = "interactive"

class CloudflareSolver:
    """
    A class for solving Cloudflare challenges with Zendriver.
    """

    _instance = None  # Class-level singleton instance
    _lock = asyncio.Lock()  # Class-level lock for synchronization
    _last_successful_cookie = None  # Last successfully obtained cookie
    _last_cookie_time = None  # Timestamp of last successful cookie

    @classmethod
    async def get_instance(
        cls,
        *,
        user_agent: Optional[str],
        timeout: float,
        http2: bool = True,
        http3: bool = True,
        headless: bool = True,
        proxy: Optional[str] = None,
    ) -> 'CloudflareSolver':
        """Get or create a CloudflareSolver instance."""
        async with cls._lock:
            if cls._instance is None:
                cls._instance = cls(
                    user_agent=user_agent,
                    timeout=timeout,
                    http2=http2,
                    http3=http3,
                    headless=headless,
                    proxy=proxy
                )
            return cls._instance

    def __init__(
        self,
        *,
        user_agent: Optional[str],
        timeout: float,
        http2: bool = True,
        http3: bool = True,
        headless: bool = True,
        proxy: Optional[str] = None,
    ) -> None:
        config = zendriver.Config(headless=headless)

        if user_agent is not None:
            config.add_argument(f"--user-agent={user_agent}")

        if not http2:
            config.add_argument("--disable-http2")

        if not http3:
            config.add_argument("--disable-quic")

        if proxy:
            auth_proxy = SeleniumAuthenticatedProxy(proxy)
            auth_proxy.enrich_chrome_options(config)

        self.driver = zendriver.Browser(config)
        self._timeout = timeout
        self._cookie_valid_duration = timedelta(minutes=10)  # Cookie validity period

    async def __aenter__(self) -> 'CloudflareSolver':
        await self.driver.start()
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self.driver.stop()

    @staticmethod
    def _format_cookies(cookies: Iterable[Cookie]) -> List[T_JSON_DICT]:
        """Format cookies into a list of JSON cookies."""
        return [cookie.to_json() for cookie in cookies]

    @staticmethod
    def extract_clearance_cookie(
        cookies: Iterable[T_JSON_DICT],
    ) -> Optional[T_JSON_DICT]:
        """Extract the Cloudflare clearance cookie from a list of cookies."""
        for cookie in cookies:
            if cookie["name"] == "cf_clearance":
                return cookie
        return None

    async def get_user_agent(self) -> str:
        """Get the current user agent string."""
        return await self.driver.main_tab.evaluate("navigator.userAgent")

    async def get_cookies(self) -> List[T_JSON_DICT]:
        """Get all cookies from the current page."""
        return self._format_cookies(await self.driver.cookies.get_all())

    async def detect_challenge(self) -> Optional[ChallengePlatform]:
        """Detect the Cloudflare challenge platform on the current page."""
        html = await self.driver.main_tab.get_content()

        for platform in ChallengePlatform:
            if f"cType: '{platform.value}'" in html:
                return platform

        return None

    async def solve_challenge(self) -> None:
        """Solve the Cloudflare challenge on the current page."""
        start_timestamp = datetime.now()

        while (
            self.extract_clearance_cookie(await self.get_cookies()) is None
            and await self.detect_challenge() is not None
            and (datetime.now() - start_timestamp).seconds < self._timeout
        ):
            widget_input = await self.driver.main_tab.find("input")

            if widget_input.parent is None or not widget_input.parent.shadow_roots:
                await asyncio.sleep(0.25)
                continue

            challenge = Element(
                widget_input.parent.shadow_roots[0],
                self.driver.main_tab,
                widget_input.parent.tree,
            )

            challenge = challenge.children[0]

            if (
                isinstance(challenge, Element)
                and "display: none;" not in challenge.attrs["style"]
            ):
                await asyncio.sleep(1)

                try:
                    await challenge.get_position()
                except Exception:
                    continue

                await challenge.mouse_click()

    @classmethod
    async def check_existing_cookie(cls) -> Optional[Dict[str, Any]]:
        """Check if we have a valid cached cookie."""
        if (cls._last_successful_cookie and cls._last_cookie_time and 
            datetime.now(timezone.utc) - cls._last_cookie_time < timedelta(minutes=30)):
            return cls._last_successful_cookie
        return None

    @classmethod
    def update_cookie_cache(cls, cookie_data: Dict[str, Any]) -> None:
        """Update the cached cookie data."""
        cls._last_successful_cookie = cookie_data
        cls._last_cookie_time = datetime.now(timezone.utc)

async def get_cf_clearance(url: str, timeout: float = 30, proxy: Optional[str] = None, headless: bool = True) -> Dict[str, Any]:
    """
    Get Cloudflare clearance cookie and user agent for a specific URL.
    """
    # Check for existing valid cookie first
    existing_cookie = await CloudflareSolver.check_existing_cookie()
    if existing_cookie:
        logging.info("Using cached cookie")
        return existing_cookie

    user_agent = get_chrome_user_agent()
    logging.info(f"Starting browser with user agent: {user_agent}")
    logging.info(f"Mode: {'headless' if headless else 'headed'}")
    
    try:
        solver = await CloudflareSolver.get_instance(
            user_agent=user_agent,
            timeout=timeout,
            headless=headless,
            proxy=proxy,
        )

        async with solver:
            logging.info(f"Navigating to {url}")
            await solver.driver.get(url)
            
            all_cookies = await solver.get_cookies()
            clearance_cookie = solver.extract_clearance_cookie(all_cookies)
            
            if clearance_cookie is None:
                challenge_platform = await solver.detect_challenge()
                if challenge_platform is not None:
                    logging.info(f"Detected Cloudflare challenge: {challenge_platform.value}")
                    try:
                        logging.info("Attempting to solve challenge...")
                        await solver.solve_challenge()
                        logging.info("Challenge solving complete")
                        all_cookies = await solver.get_cookies()
                        clearance_cookie = solver.extract_clearance_cookie(all_cookies)
                    except asyncio.TimeoutError:
                        logging.error("Timeout while solving challenge")
            
            current_user_agent = await solver.get_user_agent()
            
            if clearance_cookie:
                cookie_string = "; ".join(
                    f'{cookie["name"]}={cookie["value"]}' for cookie in all_cookies
                )
                logging.info("Successfully obtained clearance cookie")
                result = {
                    "success": True,
                    "cookie": cookie_string,
                    "user_agent": current_user_agent
                }
                CloudflareSolver.update_cookie_cache(result)
                print(f"Cookie: {cookie_string}")
                print(f"User agent: {current_user_agent}")
                return result
            else:
                logging.error("Failed to obtain clearance cookie")
                return {
                    "success": False,
                    "error": "Failed to obtain clearance cookie"
                }
            
    except Exception as e:
        logging.error(f"Error: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Get Cloudflare clearance cookies"
    )
    
    parser.add_argument(
        "url",
        help="The URL to scrape the Cloudflare clearance cookie from",
        type=str,
    )
    
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run the browser in headed mode",
        default=False  # Default to headless mode
    )
    
    parser.add_argument(
        "--timeout",
        default=30,
        help="Timeout in seconds",
        type=float,
    )
    
    parser.add_argument(
        "--proxy",
        default=None,
        help="Proxy URL",
        type=str,
    )
    
    args = parser.parse_args()
    
    # Get clearance
    result = await get_cf_clearance(
        args.url,
        timeout=args.timeout,
        proxy=args.proxy,
        headless=not args.headed
    )
    
    # Exit with appropriate status code
    sys.exit(0 if result.get("success", False) else 1)

if __name__ == "__main__":
    asyncio.run(main())