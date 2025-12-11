import { useState, useEffect } from "react";
import { useSettings, StaffMember, PipelineColumn, PipelineConfig } from "@/lib/settingsContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, Plus, Save, X, User, GripVertical, Settings, Layers, Users, Check, Boxes, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkType, WorkTypeStage, InsertWorkType, InsertWorkTypeStage } from "@shared/schema";

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
  { value: "bg-slate-500", label: "Slate" },
  { value: "bg-red-500", label: "Red" },
  { value: "bg-green-500", label: "Green" },
  { value: "bg-gray-500", label: "Gray" },
];

const SKILL_OPTIONS = ["posts", "panels", "production"] as const;

export function SettingsPanel() {
  return (
    <Tabs defaultValue="staff" className="w-full">
      <TabsList className="grid w-full grid-cols-4 mb-4">
        <TabsTrigger value="staff" className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Staff
        </TabsTrigger>
        <TabsTrigger value="work-types" className="flex items-center gap-2">
          <Boxes className="h-4 w-4" />
          Work Types
        </TabsTrigger>
        <TabsTrigger value="pipelines" className="flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Pipelines
        </TabsTrigger>
        <TabsTrigger value="general" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          General
        </TabsTrigger>
      </TabsList>

      <TabsContent value="staff">
        <StaffSettings />
      </TabsContent>

      <TabsContent value="work-types">
        <WorkTypesSettings />
      </TabsContent>

      <TabsContent value="pipelines">
        <PipelineSettings />
      </TabsContent>

      <TabsContent value="general">
        <GeneralSettings />
      </TabsContent>
    </Tabs>
  );
}

function StaffSettings() {
  const { staff, addStaff, updateStaff, deleteStaff } = useSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<StaffMember>>({});
  const [newStaffForm, setNewStaffForm] = useState<Partial<StaffMember>>({
    name: "",
    role: "install",
    dailyCapacityHours: 8,
    skills: [],
    color: "bg-blue-500",
    active: true,
  });

  const filteredStaff = staff.filter(s => s.id !== "all");

  const handleEdit = (member: StaffMember) => {
    setEditingId(member.id);
    setEditForm({ ...member });
  };

  const handleSaveEdit = () => {
    if (editingId && editForm.name) {
      updateStaff(editForm as StaffMember);
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
      const id = newStaffForm.name.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
      addStaff({
        id,
        name: newStaffForm.name,
        role: newStaffForm.role as "sales" | "production" | "install",
        dailyCapacityHours: newStaffForm.dailyCapacityHours || 8,
        skills: newStaffForm.skills || [],
        color: newStaffForm.color || "bg-blue-500",
        active: true,
      });
      setNewStaffForm({
        name: "",
        role: "install",
        dailyCapacityHours: 8,
        skills: [],
        color: "bg-blue-500",
        active: true,
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
                
                <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-2 ml-auto">
                    <Label className="text-xs">Active</Label>
                    <Switch 
                      checked={editForm.active} 
                      onCheckedChange={(v) => setEditForm({ ...editForm, active: v })}
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSaveEdit}>
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
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white font-bold", member.color, !member.active && "opacity-50")}>
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <div className={cn("font-medium", !member.active && "text-muted-foreground line-through")}>{member.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{member.role} • {member.dailyCapacityHours}h/day</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!member.active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
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
                      onClick={() => deleteStaff(member.id)}
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

function PipelineSettings() {
  const { pipelines, addPipelineColumn, updatePipelineColumn, deletePipelineColumn, reorderPipelineColumns } = useSettings();
  const [activePipeline, setActivePipeline] = useState<keyof PipelineConfig>("leads");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<PipelineColumn>>({});
  const [newColumnForm, setNewColumnForm] = useState<Partial<PipelineColumn>>({
    title: "",
    color: "bg-blue-500",
  });

  const columns = pipelines[activePipeline];

  const handleEdit = (column: PipelineColumn) => {
    setEditingId(column.id);
    setEditForm({ ...column });
  };

  const handleSaveEdit = () => {
    if (editingId && editForm.title) {
      updatePipelineColumn(activePipeline, editForm as PipelineColumn);
      setEditingId(null);
      setEditForm({});
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleAddNew = () => {
    if (newColumnForm.title) {
      const id = newColumnForm.title.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
      addPipelineColumn(activePipeline, {
        id,
        title: newColumnForm.title,
        color: newColumnForm.color || "bg-blue-500",
      });
      setNewColumnForm({
        title: "",
        color: "bg-blue-500",
      });
      setIsAdding(false);
    }
  };

  const moveColumn = (index: number, direction: "up" | "down") => {
    const newColumns = [...columns];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newColumns.length) return;
    [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];
    reorderPipelineColumns(activePipeline, newColumns);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["leads", "quotes", "production"] as const).map(pipeline => (
          <Button
            key={pipeline}
            variant={activePipeline === pipeline ? "default" : "outline"}
            size="sm"
            onClick={() => setActivePipeline(pipeline)}
            className="capitalize"
            data-testid={`pipeline-tab-${pipeline}`}
          >
            {pipeline}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-medium capitalize">{activePipeline} Pipeline Stages</CardTitle>
          <CardDescription className="text-xs">Drag to reorder, click to edit</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-2">
          {columns.map((column, index) => (
            <div key={column.id} className={cn("flex items-center gap-2 p-2 border rounded", editingId === column.id && "border-primary")}>
              <div className="flex flex-col gap-0.5">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-5 w-5"
                  onClick={() => moveColumn(index, "up")}
                  disabled={index === 0}
                >
                  <span className="text-xs">▲</span>
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-5 w-5"
                  onClick={() => moveColumn(index, "down")}
                  disabled={index === columns.length - 1}
                >
                  <span className="text-xs">▼</span>
                </Button>
              </div>
              
              {editingId === column.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={editForm.title || ""}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="h-8"
                  />
                  <Select 
                    value={editForm.color} 
                    onValueChange={(v) => setEditForm({ ...editForm, color: v })}
                  >
                    <SelectTrigger className="w-24 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-3 h-3 rounded-full", c.value)} />
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className={cn("w-3 h-3 rounded-full shrink-0", column.color)} />
                  <span className="flex-1 text-sm font-medium">{column.title}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">{column.id}</Badge>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7"
                    onClick={() => handleEdit(column)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-7 w-7 text-destructive"
                    onClick={() => deletePipelineColumn(activePipeline, column.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}

          {isAdding ? (
            <div className="flex items-center gap-2 p-2 border border-primary rounded">
              <Input
                value={newColumnForm.title || ""}
                onChange={(e) => setNewColumnForm({ ...newColumnForm, title: e.target.value })}
                placeholder="Stage name"
                className="h-8"
                data-testid="new-stage-name"
              />
              <Select 
                value={newColumnForm.color} 
                onValueChange={(v) => setNewColumnForm({ ...newColumnForm, color: v })}
              >
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-3 h-3 rounded-full", c.value)} />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAddNew} data-testid="save-new-stage-btn">
                <Save className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsAdding(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setIsAdding(true)}
              data-testid="add-stage-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GeneralSettings() {
  const { appSettings, setAppSettings } = useSettings();
  const [form, setForm] = useState(appSettings);
  const [saved, setSaved] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [isAddingStage, setIsAddingStage] = useState(false);

  const handleSave = () => {
    setAppSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddStage = () => {
    if (!newStageName.trim()) return;
    const newStage = {
      id: `stage_${Date.now()}`,
      title: newStageName.trim(),
      order: form.installStages.length + 1
    };
    setForm({ ...form, installStages: [...form.installStages, newStage] });
    setNewStageName("");
    setIsAddingStage(false);
  };

  const handleDeleteStage = (stageId: string) => {
    setForm({ 
      ...form, 
      installStages: form.installStages.filter(s => s.id !== stageId) 
    });
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium">General Settings</CardTitle>
        <CardDescription className="text-xs">Configure application-wide settings</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Company Name</Label>
            <Input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              data-testid="company-name-input"
            />
          </div>
          <div>
            <Label className="text-xs">Default Work Hours/Day</Label>
            <Input
              type="number"
              value={form.defaultWorkHoursPerDay}
              onChange={(e) => setForm({ ...form, defaultWorkHoursPerDay: parseInt(e.target.value) })}
              data-testid="work-hours-input"
            />
          </div>
        </div>

        <div>
          <Label className="text-xs mb-2 block">Install Stages</Label>
          <div className="space-y-2">
            {form.installStages.map((stage, index) => (
              <div key={stage.id} className="flex items-center gap-2">
                <Badge variant="outline" className="w-8 justify-center">{index + 1}</Badge>
                <Input
                  value={stage.title}
                  onChange={(e) => {
                    const newStages = [...form.installStages];
                    newStages[index] = { ...stage, title: e.target.value };
                    setForm({ ...form, installStages: newStages });
                  }}
                  className="h-8 flex-1"
                  data-testid={`install-stage-${index}`}
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDeleteStage(stage.id)}
                  data-testid={`delete-stage-${index}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            
            {isAddingStage ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="w-8 justify-center">{form.installStages.length + 1}</Badge>
                <Input
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="New stage name..."
                  className="h-8 flex-1"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
                  data-testid="new-stage-input"
                />
                <Button size="icon" className="h-8 w-8" onClick={handleAddStage}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsAddingStage(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-2"
                onClick={() => setIsAddingStage(true)}
                data-testid="add-install-stage-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stage
              </Button>
            )}
          </div>
        </div>

        <Button onClick={handleSave} className="w-full" data-testid="save-settings-btn">
          {saved ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

const STAGE_CATEGORY_OPTIONS = [
  { value: "purchase_order", label: "Purchase Order" },
  { value: "production", label: "Production" },
  { value: "install", label: "Install" },
  { value: "external", label: "External" },
  { value: "admin", label: "Admin" },
];

const STAGE_COLOR_OPTIONS = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "purple", label: "Purple" },
  { value: "rose", label: "Rose" },
  { value: "cyan", label: "Cyan" },
  { value: "orange", label: "Orange" },
  { value: "slate", label: "Slate" },
];

function WorkTypesSettings() {
  const queryClient = useQueryClient();
  const [selectedWorkType, setSelectedWorkType] = useState<WorkType | null>(null);
  const [isAddingWorkType, setIsAddingWorkType] = useState(false);
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [editingStageId, setEditingStageId] = useState<number | null>(null);
  
  const [newWorkTypeForm, setNewWorkTypeForm] = useState<Partial<InsertWorkType>>({
    name: "",
    description: "",
    color: "blue",
    isActive: true,
  });
  
  const [newStageForm, setNewStageForm] = useState<Partial<InsertWorkTypeStage>>({
    name: "",
    category: "production",
    triggersScheduler: false,
    triggersPurchaseOrder: false,
    subStages: [],
  });
  
  const [editStageForm, setEditStageForm] = useState<Partial<WorkTypeStage>>({});

  const { data: workTypes = [], isLoading } = useQuery<WorkType[]>({
    queryKey: ["/api/work-types"],
  });

  const { data: selectedWorkTypeDetails } = useQuery<WorkType & { stages: WorkTypeStage[] }>({
    queryKey: ["/api/work-types", selectedWorkType?.id],
    enabled: !!selectedWorkType?.id,
  });

  const createWorkTypeMutation = useMutation({
    mutationFn: async (data: InsertWorkType) => {
      const res = await fetch("/api/work-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create work type");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-types"] });
      setIsAddingWorkType(false);
      setNewWorkTypeForm({ name: "", description: "", color: "blue", isActive: true });
    },
  });

  const deleteWorkTypeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/work-types/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete work type");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-types"] });
      if (selectedWorkType) setSelectedWorkType(null);
    },
  });

  const createStageMutation = useMutation({
    mutationFn: async (data: InsertWorkTypeStage) => {
      const res = await fetch(`/api/work-types/${selectedWorkType?.id}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create stage");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-types", selectedWorkType?.id] });
      setIsAddingStage(false);
      setNewStageForm({
        name: "",
        category: "production",
        triggersScheduler: false,
        triggersPurchaseOrder: false,
        subStages: [],
      });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ stageId, data }: { stageId: number; data: Partial<WorkTypeStage> }) => {
      const res = await fetch(`/api/work-types/${selectedWorkType?.id}/stages/${stageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update stage");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-types", selectedWorkType?.id] });
      setEditingStageId(null);
      setEditStageForm({});
    },
  });

  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: number) => {
      const res = await fetch(`/api/work-types/${selectedWorkType?.id}/stages/${stageId}`, { 
        method: "DELETE" 
      });
      if (!res.ok) throw new Error("Failed to delete stage");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-types", selectedWorkType?.id] });
    },
  });

  const reorderStagesMutation = useMutation({
    mutationFn: async (stageIds: number[]) => {
      const res = await fetch(`/api/work-types/${selectedWorkType?.id}/stages/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder stages");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-types", selectedWorkType?.id] });
    },
  });

  const handleCreateWorkType = () => {
    if (newWorkTypeForm.name) {
      createWorkTypeMutation.mutate(newWorkTypeForm as InsertWorkType);
    }
  };

  const handleCreateStage = () => {
    if (newStageForm.name && selectedWorkType) {
      const stagesCount = selectedWorkTypeDetails?.stages?.length || 0;
      const key = newStageForm.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      createStageMutation.mutate({
        ...newStageForm,
        key,
        workTypeId: selectedWorkType.id,
        orderIndex: stagesCount + 1,
      } as InsertWorkTypeStage);
    }
  };

  const handleEditStage = (stage: WorkTypeStage) => {
    setEditingStageId(stage.id);
    setEditStageForm({ ...stage });
  };

  const handleSaveStageEdit = () => {
    if (editingStageId && editStageForm.name) {
      updateStageMutation.mutate({ stageId: editingStageId, data: editStageForm });
    }
  };

  const moveStage = (index: number, direction: "up" | "down") => {
    const stages = selectedWorkTypeDetails?.stages || [];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;
    
    const newStageIds = [...stages].map(s => s.id);
    [newStageIds[index], newStageIds[targetIndex]] = [newStageIds[targetIndex], newStageIds[index]];
    reorderStagesMutation.mutate(newStageIds);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading work types...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Card className="w-1/3">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium">Work Types</CardTitle>
            <CardDescription className="text-xs">Define different job workflows</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2">
            {workTypes.map((wt) => (
              <div
                key={wt.id}
                className={cn(
                  "flex items-center justify-between p-2 rounded cursor-pointer border",
                  selectedWorkType?.id === wt.id ? "border-primary bg-muted" : "border-transparent hover:bg-muted/50"
                )}
                onClick={() => setSelectedWorkType(wt)}
                data-testid={`work-type-${wt.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full", `bg-${wt.color}-500`)} />
                  <span className="text-sm font-medium">{wt.name}</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteWorkTypeMutation.mutate(wt.id);
                  }}
                  data-testid={`delete-work-type-${wt.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {isAddingWorkType ? (
              <div className="space-y-2 p-2 border rounded">
                <Input
                  value={newWorkTypeForm.name || ""}
                  onChange={(e) => setNewWorkTypeForm({ ...newWorkTypeForm, name: e.target.value })}
                  placeholder="Work type name"
                  className="h-8"
                  data-testid="new-work-type-name"
                />
                <Textarea
                  value={newWorkTypeForm.description || ""}
                  onChange={(e) => setNewWorkTypeForm({ ...newWorkTypeForm, description: e.target.value })}
                  placeholder="Description (optional)"
                  className="h-16 resize-none"
                />
                <Select
                  value={newWorkTypeForm.color}
                  onValueChange={(v) => setNewWorkTypeForm({ ...newWorkTypeForm, color: v })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_COLOR_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 rounded-full", `bg-${c.value}-500`)} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateWorkType} disabled={createWorkTypeMutation.isPending}>
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsAddingWorkType(false)}>
                    <X className="h-3 w-3 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setIsAddingWorkType(true)}
                data-testid="add-work-type-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Work Type
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="flex-1">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedWorkType ? `Stages for "${selectedWorkType.name}"` : "Select a Work Type"}
            </CardTitle>
            <CardDescription className="text-xs">
              {selectedWorkType ? "Configure stages and their order" : "Click a work type to configure its stages"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2">
            {selectedWorkType && selectedWorkTypeDetails?.stages ? (
              <>
                {selectedWorkTypeDetails.stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className={cn(
                      "flex items-center gap-2 p-2 border rounded",
                      editingStageId === stage.id && "border-primary"
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => moveStage(index, "up")}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={() => moveStage(index, "down")}
                        disabled={index === selectedWorkTypeDetails.stages.length - 1}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>

                    {editingStageId === stage.id ? (
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={editStageForm.name || ""}
                            onChange={(e) => setEditStageForm({ ...editStageForm, name: e.target.value })}
                            className="h-8 flex-1"
                          />
                          <Select
                            value={editStageForm.category}
                            onValueChange={(v) => setEditStageForm({ ...editStageForm, category: v })}
                          >
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGE_CATEGORY_OPTIONS.map((c) => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={editStageForm.triggersScheduler}
                              onCheckedChange={(v) => setEditStageForm({ ...editStageForm, triggersScheduler: v })}
                            />
                            <Label className="text-xs">Show in Scheduler</Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={editStageForm.triggersPurchaseOrder}
                              onCheckedChange={(v) => setEditStageForm({ ...editStageForm, triggersPurchaseOrder: v })}
                            />
                            <Label className="text-xs">Triggers PO</Label>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveStageEdit}>
                            <Save className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingStageId(null)}>
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={cn("w-3 h-3 rounded-full shrink-0", 
                          stage.category === 'purchase_order' ? 'bg-purple-500' :
                          stage.category === 'production' ? 'bg-amber-500' :
                          stage.category === 'install' ? 'bg-green-500' :
                          stage.category === 'external' ? 'bg-cyan-500' : 'bg-slate-500'
                        )} />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{stage.name}</div>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px]">{stage.category}</Badge>
                            {stage.triggersScheduler && <Badge variant="secondary" className="text-[10px]">Scheduler</Badge>}
                            {stage.triggersPurchaseOrder && <Badge variant="secondary" className="text-[10px]">PO</Badge>}
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleEditStage(stage)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteStageMutation.mutate(stage.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}

                {isAddingStage ? (
                  <div className="space-y-2 p-2 border border-primary rounded">
                    <div className="flex gap-2">
                      <Input
                        value={newStageForm.name || ""}
                        onChange={(e) => setNewStageForm({ ...newStageForm, name: e.target.value })}
                        placeholder="Stage name"
                        className="h-8 flex-1"
                        data-testid="new-stage-name"
                      />
                      <Select
                        value={newStageForm.category}
                        onValueChange={(v) => setNewStageForm({ ...newStageForm, category: v })}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGE_CATEGORY_OPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={newStageForm.triggersScheduler}
                          onCheckedChange={(v) => setNewStageForm({ ...newStageForm, triggersScheduler: v })}
                        />
                        <Label className="text-xs">Show in Scheduler</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={newStageForm.triggersPurchaseOrder}
                          onCheckedChange={(v) => setNewStageForm({ ...newStageForm, triggersPurchaseOrder: v })}
                        />
                        <Label className="text-xs">Triggers PO</Label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleCreateStage} disabled={createStageMutation.isPending}>
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setIsAddingStage(false)}>
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsAddingStage(true)}
                    data-testid="add-stage-btn"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Stage
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Select a work type from the left to configure its stages
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
