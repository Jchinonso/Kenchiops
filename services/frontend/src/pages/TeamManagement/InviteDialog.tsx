import type { InviteDialogProps } from "./types";
import { titleCase } from "@/lib/formatters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const InviteDialog = ({
  open,
  onOpenChange,
  inviteEmail,
  onEmailChange,
  inviteRole,
  onRoleChange,
  assignableRoles,
  isCreating,
  onClose,
  onConfirm,
}: InviteDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invite a Team Member</DialogTitle>
        <DialogDescription>
          Send an email invitation to join your organization. They will receive a link to accept the
          invitation.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(event) => onEmailChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && inviteEmail.trim()) {
                void onConfirm();
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <Select value={inviteRole} onValueChange={onRoleChange}>
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {assignableRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {titleCase(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={isCreating || !inviteEmail.trim()}
          onClick={() => {
            onConfirm();
          }}
        >
          {isCreating ? "Sending..." : "Send Invitation"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
