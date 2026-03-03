import type { MemberAvatarProps } from "./types";

export const MemberAvatar = ({ member }: MemberAvatarProps) => {
  const initials = member.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return member.avatarUrl ? (
    <img
      src={member.avatarUrl}
      alt={member.displayName}
      className="w-8 h-8 rounded-full flex-shrink-0"
    />
  ) : (
    <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
      <span className="text-white font-medium text-xs">{initials}</span>
    </div>
  );
};
