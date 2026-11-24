import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';

const CODE_KEYWORD_REGEX = /(验证码|校验码|认证码|动态码|登录码|确认码|激活码|安全码|验证|verification|verify|\botp\b|one[\s-]?time|passcode|security code|confirmation code|\bcode\b|2fa)/i;

function aiText(res) {
	if (res == null) return '';
	if (typeof res === 'string') return res;
	if (typeof res.response === 'string') return res.response;
	if (res.choices && res.choices[0] && res.choices[0].message && typeof res.choices[0].message.content === 'string') return res.choices[0].message.content;
	if (res.result) return aiText(res.result);
	return '';
}
function parseCode(text) {
	if (!text) return '';
	const s = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
	try { const j = JSON.parse(s); if (j && typeof j.code === 'string') return j.code; } catch (e) { /* ignore */ }
	const m = s.match(/"code"\s*:\s*"([^"]{0,8})"/i);
	return m ? m[1] : '';
}
function regexCode(text) {
	if (!text) return '';
	// 优先 6 位连续数字（绝大多数验证码）
	const six = text.match(/\b\d{6}\b/);
	if (six) return six[0];
	// 关键词前后 ±40 字符内的 4-8 位数字（排除 19xx/20xx 年份）
	const kw = /(验证码|校验码|认证码|动态码|登录码|确认码|激活码|安全码|verification\s*code|verify\s*code|security\s*code|confirmation\s*code|\bcode\b|\botp\b|\bpin\b|2fa)/gi;
	let k;
	while ((k = kw.exec(text)) !== null) {
		const seg = text.slice(Math.max(0, k.index - 40), k.index + k[0].length + 40);
		const d = seg.match(/\b(\d{4,8})\b/);
		if (d && !/^(19|20)\d{2}$/.test(d[1])) return d[1];
	}
	return '';
}

const aiService = {
	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}
		const subject = email.subject || '';
		const text = emailUtils.formatText(email.text || '');
		const htmlText = emailUtils.htmlToText(email.html || '');
		const body = (htmlText || text).slice(0, 6000);
		if (!subject && !body) {
			return '';
		}
		// 关键词预筛：无验证码相关词就不调 AI（省钱）
		if (!CODE_KEYWORD_REGEX.test(subject) && !CODE_KEYWORD_REGEX.test(body)) {
			return '';
		}
		let code = '';
		try {
			const result = await c.env.ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct-fast', {
				messages: [
					{ role: 'system', content: 'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.' },
					{ role: 'user', content: `Subject: ${subject}\n\n${body}` }
				],
				temperature: 0,
				max_tokens: 32
			});
			code = parseCode(aiText(result));
		} catch (e) {
			console.error('验证码提取失败:', e && (e.message || e));
		}
		// AI 没结果/报错 → 本地正则兜底
		if (!code) {
			code = regexCode(subject) || regexCode(body);
		}
		code = (code || '').trim();
		if (!code || code.length > 8 || /\s/.test(code)) {
			code = '';
		}
		return code;
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}
		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];
		if (filterList.length === 0) {
			return true;
		}
		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();
		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export default aiService;
