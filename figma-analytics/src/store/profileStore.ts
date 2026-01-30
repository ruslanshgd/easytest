import type { AppStore } from './index';
import type { Team, TeamMember, TeamInvitation } from './types';

export interface CreatedInvite {
  email: string;
  link: string;
}

export interface ProfileStore {
  // State
  loading: boolean;
  user: any | null;
  team: Team | null;
  teamMembers: TeamMember[];
  teamInvitations: TeamInvitation[];
  isOwner: boolean;
  
  // Modal states
  showCreateTeam: boolean;
  showInviteForm: boolean;
  
  // Form states
  teamName: string;
  inviteEmails: string;
  creatingTeam: boolean;
  inviting: boolean;
  inviteError: string | null;
  createdInvites: CreatedInvite[];
  copiedLink: string | null;
  
  // Actions
  setLoading: (loading: boolean) => void;
  setUser: (user: any | null) => void;
  setTeam: (team: Team | null) => void;
  setTeamMembers: (members: TeamMember[]) => void;
  setTeamInvitations: (invitations: TeamInvitation[]) => void;
  setIsOwner: (isOwner: boolean) => void;
  
  // Modal actions
  openCreateTeam: () => void;
  closeCreateTeam: () => void;
  openInviteForm: () => void;
  closeInviteForm: () => void;
  
  // Form actions
  setTeamName: (name: string) => void;
  setInviteEmails: (emails: string) => void;
  setCreatingTeam: (creating: boolean) => void;
  setInviting: (inviting: boolean) => void;
  setInviteError: (error: string | null) => void;
  setCreatedInvites: (invites: CreatedInvite[]) => void;
  setCopiedLink: (link: string | null) => void;
  resetForms: () => void;
  /** Сброс данных команды после удаления (frontend + Zustand) */
  resetTeam: () => void;
}

export const createProfileStore = (set: any, get: any): ProfileStore => ({
  // Initial state
  loading: true,
  user: null,
  team: null,
  teamMembers: [],
  teamInvitations: [],
  isOwner: false,
  showCreateTeam: false,
  showInviteForm: false,
  teamName: "",
  inviteEmails: "",
  creatingTeam: false,
  inviting: false,
  inviteError: null,
  createdInvites: [],
  copiedLink: null,
  
  // Actions
  setLoading: (loading) => set({ loading }),
  setUser: (user) => set({ user }),
  setTeam: (team) => set({ team }),
  setTeamMembers: (members) => set({ teamMembers: members }),
  setTeamInvitations: (invitations) => set({ teamInvitations: invitations }),
  setIsOwner: (isOwner) => set({ isOwner }),
  
  // Modal actions
  openCreateTeam: () => set({ showCreateTeam: true }),
  closeCreateTeam: () => set({ 
    showCreateTeam: false, 
    teamName: "" 
  }),
  
  openInviteForm: () => set({ showInviteForm: true }),
  closeInviteForm: () => set({ 
    showInviteForm: false, 
    inviteEmails: "",
    inviteError: null,
    createdInvites: []
  }),
  
  // Form actions
  setTeamName: (name) => set({ teamName: name }),
  setInviteEmails: (emails) => set({ inviteEmails: emails }),
  setCreatingTeam: (creating) => set({ creatingTeam: creating }),
  setInviting: (inviting) => set({ inviting }),
  setInviteError: (error) => set({ inviteError: error }),
  setCreatedInvites: (invites) => set({ createdInvites: invites }),
  setCopiedLink: (link) => set({ copiedLink: link }),
  
  resetForms: () => set({
    teamName: "",
    inviteEmails: "",
    inviteError: null,
    createdInvites: [],
    copiedLink: null,
  }),

  resetTeam: () => set({
    team: null,
    teamMembers: [],
    teamInvitations: [],
    isOwner: false,
  }),
});
