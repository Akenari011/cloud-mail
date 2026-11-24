import emailUtils from '../utils/email-utils';

const TELEGRAM_MESSAGE_LIMIT = 3500;
const TRUNCATED_SUFFIX = '...';

function escapeHtml(text = '') {
	return text
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function truncateText(text, maxLength) {
	if (!text || text.length <= maxLength) {
		return text || '';
	}

	if (maxLength <= TRUNCATED_SUFFIX.length) {
		return TRUNCATED_SUFFIX.slice(0, maxLength);
	}

	return text.slice(0, maxLength - TRUNCATED_SUFFIX.length) + TRUNCATED_SUFFIX;
}

// 转发到 Telegram 的消息：只显示 主题 / 发件人 / 时间；正文详情点开小程序 View 查看
export default function emailMsgTemplate(email) {
	const fromName = escapeHtml(email.name || '');
	const fromEmail = escapeHtml(email.sendEmail || '');
	const fromLine = fromEmail ? fromName + ' <' + fromEmail + '>' : fromName;
	const time = escapeHtml(email.createTime || '');

	let template = '<b>' + escapeHtml(email.subject || '') + '</b>' + '\n发件人：' + fromLine;

	if (time) {
		template += '\n时间：' + time;
	}

	return template;
}
