import contextlib
import io
import json
import shutil
import smtplib
import unittest
import uuid
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

import birthday_bot as bot


TEST_ROOT = bot.ROOT / ".test-tmp"


class FileTests(unittest.TestCase):
    def setUp(self):
        TEST_ROOT.mkdir(exist_ok=True)
        self.root = TEST_ROOT / uuid.uuid4().hex
        # Windows 沙箱中 mode=0o700 的临时目录可能无法再次打开。
        self.root.mkdir(mode=0o777)
        self.addCleanup(self.cleanup_directory)

    def cleanup_directory(self):
        target = self.root.resolve()
        if target == TEST_ROOT.resolve() or not target.is_relative_to(TEST_ROOT.resolve()):
            raise ValueError("测试临时目录超出项目范围")
        shutil.rmtree(target)


class CalendarTests(unittest.TestCase):
    def test_only_matches_birthdays_on_selected_day(self):
        people = [bot.Person("1", "甲", 10, 27), bot.Person("2", "乙", 10, 28)]
        results = bot.find_reminders(people, date(2026, 10, 27), [0], "feb28")
        self.assertEqual([event.person.name for event in results], ["甲"])

    def test_advance_reminder_crosses_year(self):
        people = [bot.Person("1", "元旦生日", 1, 1)]
        result = bot.find_reminders(people, date(2026, 12, 29), [3, 0], "feb28")
        self.assertEqual([(event.birthday, event.lead_days) for event in result], [(date(2027, 1, 1), 3)])

    def test_all_leap_day_policies_and_leap_year(self):
        person = bot.Person("1", "闰日生日", 2, 29)
        self.assertEqual(bot.observed_birthday(person, 2027, "feb28"), date(2027, 2, 28))
        self.assertEqual(bot.observed_birthday(person, 2027, "mar01"), date(2027, 3, 1))
        self.assertIsNone(bot.observed_birthday(person, 2027, "strict"))
        for policy in ["feb28", "mar01", "strict"]:
            self.assertEqual(bot.observed_birthday(person, 2028, policy), date(2028, 2, 29))

    def test_multiple_birthdays_are_combined(self):
        reminders = [bot.Reminder(bot.Person(str(i), name, 10, 27), date(2026, 10, 27), 0)
                     for i, name in enumerate(["小明", "小红"])]
        subject, body = bot.build_message(reminders, date(2026, 10, 27))
        self.assertIn("小明", subject)
        self.assertIn("小红", subject)
        self.assertIn("小明", body)
        self.assertIn("小红", body)


class DataAndPreviewTests(FileTests):
    def test_excel_bom_and_full_date(self):
        path = self.root / "people.csv"
        path.write_text("id,name,birthday\n1,张三,2000-02-29\n", encoding="utf-8-sig")
        self.assertEqual(bot.load_people(path), [bot.Person("1", "张三", 2, 29)])

    def test_invalid_dates_and_duplicate_ids_fail(self):
        path = self.root / "people.csv"
        for rows in ["1,甲,02-30\n", "1,甲,2001-02-29\n", "1,甲,01-01\n1,乙,02-02\n"]:
            with self.subTest(rows=rows):
                path.write_text("id,name,birthday\n" + rows, encoding="utf-8")
                with self.assertRaises(ValueError):
                    bot.load_people(path)

    def test_recipients_are_deduplicated(self):
        path = self.root / "recipients.csv"
        path.write_text("name,email\n甲,person@domain.test\n乙,person@domain.test\n", encoding="utf-8")
        self.assertEqual(len(bot.load_recipients(path)), 1)

    def test_preview_makes_no_network_calls_or_database(self):
        (self.root / "birthdays.csv").write_text("id,name,birthday\n1,甲,10-27\n", encoding="utf-8")
        (self.root / "recipients.csv").write_text("name,email\n乙,person@example.com\n", encoding="utf-8")
        config = self.root / "config.json"
        config.write_text(json.dumps({"remind_days": [0]}), encoding="utf-8")
        output = io.StringIO()
        with patch.object(bot, "send_email") as sender, contextlib.redirect_stdout(output):
            code = bot.main(["--config", str(config), "--date", "2026-10-27"])
        self.assertEqual(code, 0)
        self.assertIn("仅预览", output.getvalue())
        sender.assert_not_called()
        self.assertFalse((self.root / "data").exists())

    def test_simulation_cannot_send(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            bot.main(["--date", "2026-10-27", "--send"])

    def test_bad_configuration_is_reported(self):
        config = self.root / "config.json"
        for value in [[], {"remind_days": [True]}, {"send_at": "25:00"}, {"leap_day_policy": "unknown"}]:
            with self.subTest(value=value):
                config.write_text(json.dumps(value), encoding="utf-8")
                with self.assertRaises(ValueError):
                    bot.load_settings(config)

    def test_smtp_check_does_not_need_lists_or_send_mail(self):
        config = self.root / "config.json"
        settings = {"smtp": {"host": "smtp.domain.test", "port": 465, "security": "ssl",
                             "username": "sender@domain.test", "password": "test-secret"}}
        config.write_text(json.dumps(settings), encoding="utf-8")
        connection = MagicMock()
        with patch.object(bot, "connect_smtp", return_value=connection), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(bot.main(["--config", str(config), "--check-smtp"]), 0)
        connection.send_message.assert_not_called()
        connection.close.assert_called_once()
        self.assertFalse((self.root / "data").exists())


class DeliveryTests(FileTests):
    def setUp(self):
        super().setUp()
        self.database = bot.open_database(self.root / "delivery.sqlite3")
        self.addCleanup(self.database.close)
        self.today = date(2026, 10, 27)
        self.reminders = [bot.Reminder(bot.Person("1", "小明", 10, 27), self.today, 0)]
        self.recipients = [bot.Recipient("甲", "a@domain.test"), bot.Recipient("乙", "b@domain.test")]

    def deliver_quietly(self):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return bot.deliver(self.database, {}, self.recipients, self.reminders, self.today)

    def test_repeated_run_does_not_resend(self):
        with patch.object(bot, "send_email") as sender:
            self.assertEqual(self.deliver_quietly(), (2, 0, 0))
            self.assertEqual(self.deliver_quietly(), (0, 2, 0))
        self.assertEqual(sender.call_count, 2)

    def test_failure_retries_only_failed_recipient(self):
        with patch.object(bot, "send_email", side_effect=[None, smtplib.SMTPException("temporary failure")]):
            self.assertEqual(self.deliver_quietly(), (1, 0, 1))
        with patch.object(bot, "send_email") as retry:
            self.assertEqual(self.deliver_quietly(), (1, 1, 0))
        self.assertEqual(retry.call_args.args[1].email, "b@domain.test")
        self.assertEqual(self.database.execute("SELECT count(*) FROM deliveries").fetchone()[0], 2)

    def test_each_year_is_a_new_event(self):
        with patch.object(bot, "send_email") as sender:
            self.deliver_quietly()
            self.today = date(2027, 10, 27)
            self.reminders = [bot.Reminder(self.reminders[0].person, self.today, 0)]
            self.assertEqual(self.deliver_quietly(), (2, 0, 0))
        self.assertEqual(sender.call_count, 4)

    def test_adding_a_birthday_does_not_resend_old_birthday(self):
        with patch.object(bot, "send_email"):
            self.deliver_quietly()
        self.reminders.append(bot.Reminder(bot.Person("2", "小红", 10, 27), self.today, 0))
        with patch.object(bot, "send_email") as sender:
            self.assertEqual(self.deliver_quietly(), (2, 0, 0))
        self.assertTrue(all([event.person.name for event in call.args[2]] == ["小红"] for call in sender.call_args_list))


class SMTPTests(unittest.TestCase):
    def test_failed_login_closes_connection(self):
        connection = MagicMock()
        connection.login.side_effect = smtplib.SMTPAuthenticationError(535, b"invalid app password")
        config = {"host": "smtp.domain.test", "port": 465, "security": "ssl",
                  "username": "sender@domain.test", "password": "test-secret"}
        with patch.object(bot.smtplib, "SMTP_SSL", return_value=connection), self.assertRaises(smtplib.SMTPAuthenticationError):
            bot.connect_smtp(config)
        connection.close.assert_called_once()
        connection.send_message.assert_not_called()

    def test_starttls_and_private_recipient(self):
        connection = MagicMock()
        connection.send_message.return_value = {}
        config = {"host": "smtp.domain.test", "port": 587, "security": "starttls",
                  "username": "sender@domain.test", "password": "test-secret", "from_email": "sender@domain.test"}
        today = date(2026, 10, 27)
        reminders = [bot.Reminder(bot.Person("1", "甲", 10, 27), today, 0)]
        with patch.object(bot.smtplib, "SMTP", return_value=connection):
            bot.send_email(config, bot.Recipient("乙", "receiver@domain.test"), reminders, today)
        connection.starttls.assert_called_once()
        connection.login.assert_called_once_with("sender@domain.test", "test-secret")
        self.assertEqual(connection.send_message.call_args.kwargs["to_addrs"], ["receiver@domain.test"])
        self.assertEqual(connection.send_message.call_args.args[0]["To"], "乙 <receiver@domain.test>")
        connection.close.assert_called_once()

    def test_ssl_refusal_is_not_recorded_as_success(self):
        connection = MagicMock()
        connection.send_message.return_value = {"receiver@domain.test": (550, b"rejected")}
        config = {"host": "smtp.domain.test", "port": 465, "security": "ssl",
                  "username": "sender@domain.test", "password": "test-secret", "from_email": "sender@domain.test"}
        today = date(2026, 10, 27)
        reminders = [bot.Reminder(bot.Person("1", "甲", 10, 27), today, 0)]
        with patch.object(bot.smtplib, "SMTP_SSL", return_value=connection), self.assertRaises(smtplib.SMTPRecipientsRefused):
            bot.send_email(config, bot.Recipient("乙", "receiver@domain.test"), reminders, today)
        connection.starttls.assert_not_called()
        connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
