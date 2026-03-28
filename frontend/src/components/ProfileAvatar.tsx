import React from 'react';
import { initialsFromNickname } from '../utils/profile';
import './ProfileAvatar.css';

interface ProfileAvatarProps {
  nickname: string;
  avatarDataUrl?: string | null;
  avatarHue?: number | null;
  className?: string;
  fallback?: 'initials' | 'silhouette';
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  nickname,
  avatarDataUrl,
  avatarHue,
  className = '',
  fallback = 'initials',
}) => {
  const hue = typeof avatarHue === 'number' ? avatarHue : 262;
  const gradientStyle = avatarDataUrl
    ? undefined
    : {
        background: `linear-gradient(135deg, hsla(${hue}, 92%, 66%, 0.96), hsla(${(hue + 44) % 360}, 88%, 52%, 0.92))`,
      };

  return (
    <div className={`profile-avatar ${className}`.trim()} style={gradientStyle} aria-hidden="true">
      {avatarDataUrl ? (
        <img className="profile-avatar-image" src={avatarDataUrl} alt="" />
      ) : fallback === 'silhouette' ? (
        <svg className="profile-avatar-silhouette" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="4.25" />
          <path d="M5.5 19.25c0-3.31 2.91-5.75 6.5-5.75s6.5 2.44 6.5 5.75" />
        </svg>
      ) : (
        <span className="profile-avatar-initials">{initialsFromNickname(nickname)}</span>
      )}
    </div>
  );
};
