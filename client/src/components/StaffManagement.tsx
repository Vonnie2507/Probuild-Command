import { useState } from "react";
import { StaffMember } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, Save, X, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface StaffManagementProps {
  staff: StaffMember[];
  onUpdateStaff: (staff: StaffMember) => void;
  onAddStaff: (staff: StaffMember) => void;
  onDeleteStaff: (staffId: string) => void;
}

const ROLE_OPTIONS = [
  { value: "sales", label: "Sales" },
  { value: "production", label: "Production" },
  { value: "install", label: "Install" },
];

const COLOR_OPTIONS = [
  { value: "bg-blue-500", label: "Blue" },
  { value: "bg-emerald-500", label: "Green" },
  { value: "bg-amber-500", label: "Amber" },
  { value: "bg-purple-500", label: "Purple" },
  { value: "bg-indigo-500", label: "Indigo" },
  { value: "bg-rose-500", label: "Rose" },
  { value: "bg-cyan-500", label: "Cyan" },
  { value: "bg-orange-500", label: "Orange" },
];

const SKILL_OPTIONS = ["posts", "panels", "production"] as const;

export function StaffManagement({ staff, onUpdateStaff, onAddStaff, onDeleteStaff }: StaffManagementProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<StaffMember>>({});
  const [newStaffForm, setNewStaffForm] = useState<Partial<StaffMember>>({
    name: "",
    role: "install",
    dailyCapacityHours: 8,
    skills: [],
    color: "bg-blue-500",
  });

  const filteredStaff = staff.filter(s => s.id !== "all");

  const handleEdit = (member: StaffMember) => {
    setEditingId(member.id);
    setEditForm({ ...member });
  };

  const handleSaveEdit = () => {
    if (editingId && editForm.name) {
      onUpdateStaff(editForm as StaffMember);
      setEditingId(null);
      setEditForm({});
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleAddNew = () => {
    if (newStaffForm.name) {
      const id = newStaffForm.name.toLowerCase().replace(/\s+/g, "_");
      onAddStaff({
        id,
        name: newStaffForm.name,
        role: newStaffForm.role as "sales" | "production" | "install",
        dailyCapacityHours: newStaffForm.dailyCapacityHours || 8,
        skills: newStaffForm.skills || [],
        color: newStaffForm.color || "bg-blue-500",
      });
      setNewStaffForm({
        name: "",
        role: "install",
        dailyCapacityHours: 8,
        skills: [],
        color: "bg-blue-500",
      });
      setIsAdding(false);
    }
  };

  const toggleSkill = (form: Partial<StaffMember>, setForm: (f: Partial<StaffMember>) => void, skill: string) => {
    const currentSkills = form.skills || [];
    const newSkills = currentSkills.includes(skill as any)
      ? currentSkills.filter(s => s !== skill)
      : [...currentSkills, skill as any];
    setForm({ ...form, skills: newSkills });
  };

  return (
    <div className="space-y-4">
      {/* Add New Staff */}
      {!isAdding ? (
        <Button onClick={() => setIsAdding(true)} className="w-full" data-testid="add-staff-btn">
          <Plus className="h-4 w-4 mr-2" />
          Add New Staff Member
        </Button>
      ) : (
        <Card className="border-primary">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Staff Member
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={newStaffForm.name || ""}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                  placeholder="Enter name"
                  data-testid="new-staff-name"
                />
              </div>
              <div>
                <Label className="text-xs">Role</Label>
                <Select 
                  value={newStaffForm.role} 
                  onValueChange={(v) => setNewStaffForm({ ...newStaffForm, role: v as any })}
                >
                  <SelectTrigger data-testid="new-staff-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Daily Hours</Label>
                <Input
                  type="number"
                  value={newStaffForm.dailyCapacityHours || 8}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, dailyCapacityHours: parseInt(e.target.value) })}
                  data-testid="new-staff-hours"
                />
              </div>
              <div>
                <Label className="text-xs">Color</Label>
                <Select 
                  value={newStaffForm.color} 
                  onValueChange={(v) => setNewStaffForm({ ...newStaffForm, color: v })}
                >
                  <SelectTrigger data-testid="new-staff-color">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 rounded-full", c.value)} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div>
              <Label className="text-xs">Skills</Label>
              <div className="flex gap-2 mt-1">
                {SKILL_OPTIONS.map(skill => (
                  <Badge
                    key={skill}
                    variant={(newStaffForm.skills || []).includes(skill) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleSkill(newStaffForm, setNewStaffForm, skill)}
                    data-testid={`new-staff-skill-${skill}`}
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleAddNew} data-testid="save-new-staff-btn">
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Staff List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredStaff.map((member) => (
          <Card key={member.id} className={cn("border-l-4", member.color.replace("bg-", "border-l-"))}>
            {editingId === member.id ? (
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={editForm.name || ""}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      data-testid={`edit-staff-name-${member.id}`}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Role</Label>
                    <Select 
                      value={editForm.role} 
                      onValueChange={(v) => setEditForm({ ...editForm, role: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Daily Hours</Label>
                    <Input
                      type="number"
                      value={editForm.dailyCapacityHours || 8}
                      onChange={(e) => setEditForm({ ...editForm, dailyCapacityHours: parseInt(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Color</Label>
                    <Select 
                      value={editForm.color} 
                      onValueChange={(v) => setEditForm({ ...editForm, color: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLOR_OPTIONS.map(c => (
                          <SelectItem key={c.value} value={c.value}>
                            <div className="flex items-center gap-2">
                              <div className={cn("w-3 h-3 rounded-full", c.value)} />
                              {c.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs">Skills</Label>
                  <div className="flex gap-2 mt-1">
                    {SKILL_OPTIONS.map(skill => (
                      <Badge
                        key={skill}
                        variant={(editForm.skills || []).includes(skill) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleSkill(editForm, setEditForm, skill)}
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSaveEdit} data-testid={`save-edit-staff-${member.id}`}>
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white font-bold", member.color)}>
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium">{member.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{member.role} • {member.dailyCapacityHours}h/day</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8"
                      onClick={() => handleEdit(member)}
                      data-testid={`edit-staff-${member.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onDeleteStaff(member.id)}
                      data-testid={`delete-staff-${member.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {member.skills && member.skills.length > 0 && (
                  <div className="flex gap-1 mt-2 pl-13">
                    {member.skills.map(skill => (
                      <Badge key={skill} variant="secondary" className="text-[10px]">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
