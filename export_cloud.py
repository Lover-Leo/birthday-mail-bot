"""生成可一次粘贴到 Google Apps Script 的代码；不导出 SMTP 密码。"""

import json
import sqlite3
from pathlib import Path

import birthday_bot as bot


def export(config_path: Path, output: Path) -> dict:
    settings = bot.load_settings(config_path.resolve())
    people = bot.load_people(settings["birthdays_file"])
    recipients = bot.load_recipients(settings["recipients_file"])
    smtp = settings.get("smtp", {})
    owner = smtp.get("username", "")
    if not bot.valid_email(owner):
        raise ValueError("请先在 config.json 设置发件邮箱")
    history = []
    database_path = settings["database_file"].resolve()
    if database_path.exists():
        database = sqlite3.connect(database_path.as_uri() + "?mode=ro", uri=True)
        try:
            for person_id, birthday, lead_days, recipient, sent_at in database.execute(
                "SELECT person_id, birthday, lead_days, recipient, sent_at FROM deliveries ORDER BY sent_at, recipient"
            ):
                history.append({"personId": person_id, "birthday": birthday, "leadDays": lead_days,
                                "recipient": recipient, "sentAt": sent_at})
        finally:
            database.close()
    data = {
        "ownerEmail": owner,
        "senderName": smtp.get("sender_name", "生日提醒小助手"),
        "sendAt": settings["send_at"],
        "remindDays": settings["remind_days"],
        "leapDayPolicy": settings["leap_day_policy"],
        "people": [{"id": person.id, "name": person.name, "birthday": f"{person.month:02}-{person.day:02}"} for person in people],
        "recipients": [{"name": recipient.name, "email": recipient.email} for recipient in recipients],
        "localHistory": history,
    }
    source = (bot.ROOT / "cloud" / "Code.gs").read_text(encoding="utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("// 私人名单与已发送记录。仅粘贴到你自己的 Apps Script 项目。\n"
                      + "const BIRTHDAY_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n\n" + source,
                      encoding="utf-8")
    return {"people": len(people), "recipients": len(recipients), "history": len(history), "output": str(output)}


if __name__ == "__main__":
    print(json.dumps(export(bot.ROOT / "config.json", bot.ROOT / "cloud" / "ReadyToPaste.gs"), ensure_ascii=False))
