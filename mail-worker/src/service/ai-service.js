import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';

const CODE_KEYWORD_REGEX = /(验证码|校验码|认证码|动态码|登录码|确认码|激活码|安全码|validation|verification|verify|\botp\b|one[\s-]?time|passcode|security code|confirmation code|\bcode\b|2fa)/i;

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
// 本地正则兜底：支持纯数字、字母数字混合码；关键词附近匹配，规避促销码/订单号误抓
function regexCode(text) {
	if (!text) return '';
	const KW = /(验证码|校验码|认证码|动态码|登录码|确认码|激活码|安全码|verification\s*code|verify\s*code|security\s*code|confirmation\s*code|one[\s-]?time|passcode|\botp\b|\bpin\b|2fa|\bcode\b)/gi;
	const BAD = /(promo|coupon|discount|referral|gift|voucher|invite|优惠|折扣|促销)/i;
	const ALNUM = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{4,8}\b/;
	const DIG = /\b(\d{4,8})\b/;
	let k;
	while ((k = KW.exec(text)) !== null) {
		const pre = text.slice(Math.max(0, k.index - 20), k.index);
		if (BAD.test(pre)) continue;
		const seg = text.slice(Math.max(0, k.index - 30), k.index + k[0].length + 30);
		const a = seg.match(ALNUM);
		if (a) return a[0];
		const d = seg.match(DIG);
		if (d && !/^(19|20)\d{2}$/.test(d[1])) return d[1];
	}
	const six = text.match(/\b\d{6}\b/);
	return six ? six[0] : '';
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
