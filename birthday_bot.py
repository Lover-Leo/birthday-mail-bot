"""公历生日邮件提醒。默认预览；只有 --send 才连接邮件服务器。"""

from __future__ import annotations

import argparse
import calendar
import csv
import json
import os
import re
import smtplib
import sqlite3
import ssl
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BEIJING = timezone(timedelta(hours=8), "Asia/Shanghai")


@dataclass(frozen=True)
class Person:
    id: str
    name: str
    month: int
    day: int


@dataclass(frozen=True)
class Recipient:
    name: str
    email: str


@dataclass(frozen=True)
class Reminder:
    person: Person
    birthday: date
    lead_days: int


def valid_email(value: str) -> bool:
    return value.isascii() and bool(re.fullmatch(r"[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+", value))


def read_csv(path: Path, columns: set[str]) -> list[dict[str, str]]:
    # utf-8-sig 同时兼容普通 UTF-8 和 Excel 导出的 UTF-8 CSV。
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not columns.issubset(reader.fieldnames or []):
            raise ValueError(f"{path.name} 缺少列：{', '.join(sorted(columns))}")
        rows = []
        for number, raw in enumerate(reader, start=2):
            if None in raw:
                raise ValueError(f"{path.name} 第 {number} 行列数过多，请检查逗号和引号")
            row = {key: (value or "").strip() for key, value in raw.items()}
            if not any(row.values()):
                continue
            if any(not row[key] for key in columns):
                raise ValueError(f"{path.name} 第 {number} 行有必填项为空")
            if any("\n" in value or "\r" in value for value in row.values()):
                raise ValueError(f"{path.name} 第 {number} 行包含换行，请使用单行内容")
            rows.append(row)
        return rows


def load_people(path: Path) -> list[Person]:
    people = []
    ids = set()
    for row in read_csv(path, {"id", "name", "birthday"}):
        if row["id"] in ids:
            raise ValueError(f"生日名单的 id 重复：{row['id']}")
        value = row["birthday"]
        if not re.fullmatch(r"(?:\d{4}-)?\d{2}-\d{2}", value):
            raise ValueError(f"{row['name']} 的生日请填写 MM-DD 或 YYYY-MM-DD")
        try:
            parsed = date.fromisoformat(value if len(value) == 10 else f"2000-{value}")
        except ValueError as error:
            raise ValueError(f"{row['name']} 的公历生日无效：{value}") from error
        people.append(Person(row["id"], row["name"], parsed.month, parsed.day))
        ids.add(row["id"])
    return people


def load_recipients(path: Path) -> list[Recipient]:
    recipients = []
    seen = set()
    for row in read_csv(path, {"name", "email"}):
        address = row["email"]
        if not valid_email(address):
            raise ValueError(f"收件邮箱格式无效：{address}")
        # 邮箱名单中重复填写同一个地址时，只发送一次。
        key = address.casefold()
        if key not in seen:
            recipients.append(Recipient(row["name"], address))
            seen.add(key)
    return recipients


def observed_birthday(person: Person, year: int, policy: str) -> date | None:
    if (person.month, person.day) == (2, 29) and not calendar.isleap(year):
        if policy == "strict":
            return None
        return date(year, 2, 28) if policy == "feb28" else date(year, 3, 1)
    return date(year, person.month, person.day)


def find_reminders(people: list[Person], today: date, lead_days: list[int], policy: str) -> list[Reminder]:
    reminders = []
    for lead in sorted(set(lead_days)):
        target = today + timedelta(days=lead)
        for person in people:
            if observed_birthday(person, target.year, policy) == target:
                reminders.append(Reminder(person, target, lead))
    return reminders


def build_message(reminders: list[Reminder], today: date) -> tuple[str, str]:
    today_names = [item.person.name for item in reminders if item.lead_days == 0]
    subject = f"[生日提醒] {today.isoformat()}"
    if today_names:
        subject += " 今日生日：" + "、".join(today_names)
    else:
        subject += " 即将到来的生日"
    lines = ["大家好，", "", "今天的生日提醒："]
    for item in reminders:
        when = "今天" if item.lead_days == 0 else f"还有 {item.lead_days} 天（{item.birthday.isoformat()}）"
        lines.append(f"• {when}是 {item.person.name} 的生日。")
    lines.extend(["", "记得送上祝福！祝寿星生日快乐，新的一岁万事顺意。", "", "— 生日提醒小助手（公历生日，北京时间）"])
    return subject, "\n".join(lines)


def load_settings(path: Path) -> dict:
    with path.open(encoding="utf-8-sig") as handle:
        settings = json.load(handle)
    if not isinstance(settings, dict):
        raise ValueError("配置文件最外层必须是 JSON 对象")
    leads = settings.get("remind_days", [0])
    if not isinstance(leads, list) or not leads or any(type(item) is not int or not 0 <= item <= 365 for item in leads):
        raise ValueError("remind_days 必须是 0 至 365 的整数列表，例如 [0] 或 [3, 0]")
    policy = settings.get("leap_day_policy", "feb28")
    if policy not in {"feb28", "mar01", "strict"}:
        raise ValueError("leap_day_policy 必须为 feb28、mar01 或 strict")
    send_at = settings.get("send_at", "09:00")
    if not isinstance(send_at, str) or not re.fullmatch(r"\d{2}:\d{2}", send_at):
        raise ValueError("send_at 请填写 HH:MM，例如 09:00")
    try:
        time.fromisoformat(send_at)
    except ValueError as error:
        raise ValueError("send_at 不是有效时间") from error
    settings.update(remind_days=leads, leap_day_policy=policy, send_at=send_at)
    for key, default in [("birthdays_file", "birthdays.csv"), ("recipients_file", "recipients.csv"), ("database_file", "data/deliveries.sqlite3")]:
        value = settings.get(key, default)
        if not isinstance(value, str) or not value:
            raise ValueError(f"{key} 必须是非空文件路径")
        settings[key] = path.parent / value
    return settings


def smtp_settings(settings: dict) -> dict:
    raw = settings.get("smtp", {})
    if not isinstance(raw, dict):
        raise ValueError("smtp 配置必须是 JSON 对象")
    config = dict(raw)
    for key in ["host", "username", "password", "from_email", "sender_name"]:
        if key in config and not isinstance(config[key], str):
            raise ValueError(f"SMTP {key} 必须是文本")
    config["password"] = os.environ.get("BIRTHDAY_SMTP_PASSWORD") or config.get("password", "")
    if not config.get("host") or config["host"].endswith("example.com"):
        raise ValueError("请在 config.json 填写真实 SMTP 服务器地址")
    if not valid_email(config.get("username", "")) or not config["password"]:
        raise ValueError("请填写发件邮箱 username 和 SMTP 授权码 password（或环境变量 BIRTHDAY_SMTP_PASSWORD）")
    config["from_email"] = config.get("from_email") or config["username"]
    if not valid_email(config["from_email"]):
        raise ValueError("from_email 邮箱格式无效")
    if config.get("security") not in {"ssl", "starttls"}:
        raise ValueError("SMTP security 必须为 ssl 或 starttls")
    if type(config.get("port")) is not int or not 1 <= config["port"] <= 65535:
        raise ValueError("SMTP port 必须是有效端口号")
    if any("\n" in str(value) or "\r" in str(value) for key, value in config.items() if key != "password"):
        raise ValueError("SMTP 配置不能包含换行")
    return config


def connect_smtp(config: dict) -> smtplib.SMTP:
    context = ssl.create_default_context()
    if config["security"] == "ssl":
        connection = smtplib.SMTP_SSL(config["host"], config["port"], timeout=30, context=context)
    else:
        connection = smtplib.SMTP(config["host"], config["port"], timeout=30)
    try:
        connection.ehlo()
        if config["security"] == "starttls":
            connection.starttls(context=context)
            connection.ehlo()
        connection.login(config["username"], config["password"])
    except BaseException:
        connection.close()
        raise
    return connection


def send_email(config: dict, recipient: Recipient, reminders: list[Reminder], today: date) -> None:
    subject, body = build_message(reminders, today)
    message = EmailMessage()
    message["From"] = formataddr((config.get("sender_name", "生日提醒小助手"), config["from_email"]))
    message["To"] = formataddr((recipient.name, recipient.email))
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False)
    message["Message-ID"] = make_msgid()
    message.set_content(body)
    connection = connect_smtp(config)
    try:
        refused = connection.send_message(message, from_addr=config["from_email"], to_addrs=[recipient.email])
        if refused:
            raise smtplib.SMTPRecipientsRefused(refused)
    finally:
        # DATA 已获确认后，QUIT 失败不能将已接受的邮件误记为发送失败。
        connection.close()


def open_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(path, timeout=5)
    database.executescript("""
        CREATE TABLE IF NOT EXISTS deliveries (
            person_id TEXT NOT NULL, birthday TEXT NOT NULL,
            lead_days INTEGER NOT NULL, recipient TEXT NOT NULL, sent_at TEXT NOT NULL,
            PRIMARY KEY (person_id, birthday, lead_days, recipient)
        );
        CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY, attempted_at TEXT NOT NULL,
            recipient TEXT NOT NULL, result TEXT NOT NULL, detail TEXT NOT NULL
        );
    """)
    return database


def deliver(database: sqlite3.Connection, config: dict, recipients: list[Recipient], reminders: list[Reminder], today: date) -> tuple[int, int, int]:
    sent = skipped = failed = 0
    for recipient in recipients:
        try:
            # 在发送期间持有事务锁，避免两个计划任务同时向同一收件人发送。
            with database:
                database.execute("BEGIN IMMEDIATE")
                pending = [item for item in reminders if database.execute(
                    "SELECT 1 FROM deliveries WHERE person_id=? AND birthday=? AND lead_days=? AND recipient=?",
                    (item.person.id, item.birthday.isoformat(), item.lead_days, recipient.email.casefold()),
                ).fetchone() is None]
                if not pending:
                    skipped += 1
                    continue
                send_email(config, recipient, pending, today)
                stamp = datetime.now(BEIJING).isoformat(timespec="seconds")
                database.executemany("INSERT INTO deliveries VALUES (?, ?, ?, ?, ?)", [
                    (item.person.id, item.birthday.isoformat(), item.lead_days, recipient.email.casefold(), stamp)
                    for item in pending
                ])
                database.execute("INSERT INTO attempts (attempted_at, recipient, result, detail) VALUES (?, ?, ?, ?)",
                                 (stamp, recipient.email, "accepted", f"{len(pending)} 条生日提醒已被 SMTP 服务器接受"))
            sent += 1
            print(f"邮件服务器已接受：{recipient.name} <{recipient.email}>")
        except (smtplib.SMTPException, OSError, sqlite3.Error) as error:
            failed += 1
            detail = f"{type(error).__name__}: {error}"
            # 失败不写入 deliveries，下次运行只重试尚未成功的收件人。
            try:
                with database:
                    database.execute("INSERT INTO attempts (attempted_at, recipient, result, detail) VALUES (?, ?, ?, ?)",
                                     (datetime.now(BEIJING).isoformat(timespec="seconds"), recipient.email, "failed", detail))
            except sqlite3.Error:
                pass
            print(f"发送失败：{recipient.name} <{recipient.email}>，{detail}", file=sys.stderr)
    return sent, skipped, failed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "config.json", help="配置文件路径")
    parser.add_argument("--send", action="store_true", help="正式发送；不加此参数时只预览")
    parser.add_argument("--scheduled", action="store_true", help="供计划任务使用：到北京时间 send_at 后才发送")
    parser.add_argument("--date", help="模拟日期 YYYY-MM-DD，仅用于预览")
    parser.add_argument("--check-smtp", action="store_true", help="仅验证 SMTP 加密连接和登录，不发送邮件")
    args = parser.parse_args(argv)
    if args.date and args.send:
        parser.error("--date 只能预览，不能与 --send 同时使用")
    if args.scheduled and not args.send:
        parser.error("--scheduled 必须与 --send 一起使用")
    if args.check_smtp and (args.send or args.scheduled or args.date):
        parser.error("--check-smtp 不能与发送或模拟日期参数同时使用")
    try:
        settings = load_settings(args.config.resolve())
        if args.check_smtp:
            config = smtp_settings(settings)
            connection = connect_smtp(config)
            connection.close()
            print(f"SMTP 加密连接和登录验证成功：{config['username']}。未发送邮件。")
            return 0
        now = datetime.now(BEIJING)
        today = date.fromisoformat(args.date) if args.date else now.date()
        if args.scheduled and now.time() < time.fromisoformat(settings["send_at"]):
            print(f"尚未到北京时间 {settings['send_at']}，本次跳过。")
            return 0
        people = load_people(settings["birthdays_file"])
        recipients = load_recipients(settings["recipients_file"])
        reminders = find_reminders(people, today, settings["remind_days"], settings["leap_day_policy"])
        print(f"检查日期：{today}（北京时间）；生日名单 {len(people)} 人；收件人 {len(recipients)} 人。")
        if not reminders:
            print("没有符合条件的生日，本次无需发送。")
            return 0
        if not recipients:
            raise ValueError("有生日需要提醒，但收件人名单为空")
        subject, body = build_message(reminders, today)
        if not args.send:
            print(f"\n【仅预览，不连接邮件服务器】\n主题：{subject}\n\n{body}\n")
            print("计划收件人：" + "、".join(f"{person.name} <{person.email}>" for person in recipients))
            print("正式发送时会检查历史记录，跳过已经成功提交给邮件服务器的提醒。")
            return 0
        config = smtp_settings(settings)
        if any(person.email.rsplit("@", 1)[1].casefold() in {"example.com", "example.org", "example.net"} for person in recipients):
            raise ValueError("收件人中仍有 example 示例邮箱，请替换成真实地址")
        database = open_database(settings["database_file"])
        try:
            sent, skipped, failed = deliver(database, config, recipients, reminders, today)
        finally:
            database.close()
        print(f"本次结果：服务器接受 {sent} 封，历史记录跳过 {skipped} 人，失败 {failed} 人。")
        return 1 if failed else 0
    except (ValueError, TypeError, KeyError, OSError, sqlite3.Error, smtplib.SMTPException) as error:
        print(f"配置或运行错误：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
