import { GuildMember, PermissionsBitField } from 'discord.js';
import db from './database';

export function getConfig(key: string, defaultValue: string = ''): string {
    const row = db.prepare('SELECT value FROM server_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
}

export function setConfig(key: string, value: string) {
    db.prepare('INSERT INTO server_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getWebhookUrl(): string | null {
    // If a dynamically created webhook exists in DB, prefer it! Otherwise fallback to .env
    const url = getConfig('webhook_url');
    if (url) return url;
    return process.env.WEBHOOK_URL || null;
}

export function getScanIntervalMinutes(): number {
    const minStr = getConfig('scan_interval');
    if (minStr) return parseInt(minStr, 10);
    return parseInt(process.env.CHECK_INTERVAL_MINUTES || '5', 10);
}

export function isPaused(): boolean {
    return getConfig('is_paused', 'false') === 'true';
}

export function getLogFormat(): 'TEXT' | 'EMBED' {
    const format = getConfig('log_format', 'TEXT').toUpperCase();
    return format === 'EMBED' ? 'EMBED' : 'TEXT';
}

export function getWhitelistedRoles(): string[] {
    const rolesJson = getConfig('whitelisted_roles', '[]');
    try {
        return JSON.parse(rolesJson);
    } catch {
        return [];
    }
}

export function addWhitelistedRole(roleId: string) {
    const roles = getWhitelistedRoles();
    if (!roles.includes(roleId)) {
        roles.push(roleId);
        setConfig('whitelisted_roles', JSON.stringify(roles));
    }
}

export function removeWhitelistedRole(roleId: string) {
    let roles = getWhitelistedRoles();
    roles = roles.filter(id => id !== roleId);
    setConfig('whitelisted_roles', JSON.stringify(roles));
}

export function isAuthorized(member: GuildMember | null, requireFullAdmin: boolean = false): boolean {
    if (!member) return false;
    // Admins always have access
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    // If only admin is required, abort
    if (requireFullAdmin) return false;

    // Check if member has any of the whitelisted roles
    const allowedRoles = getWhitelistedRoles();
    return allowedRoles.some(roleId => member.roles.cache.has(roleId));
}
